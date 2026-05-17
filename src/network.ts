import * as vscode from 'vscode';
import * as http from 'http';
import * as path from 'path';
import * as os from 'os';
import * as dgram from 'dgram';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import {
	clearAllSessionHistory,
	clearSessionHistory,
	cloneSessionContext,
	generateChatReply,
	listCopilotChatModels,
	rebuildSessionContext
} from './llm';
import {EXTENSION_ID, debugLog} from './helper';

const MAX_BODY_SIZE = 1024 * 1024;
const DEFAULT_MAX_CONCURRENT_CHAT_REQUESTS = 200;
const MIN_MAX_CONCURRENT_CHAT_REQUESTS = 1;
const MAX_MAX_CONCURRENT_CHAT_REQUESTS = 400;
const MAX_CHAT_QUEUE_LENGTH = 64;
const CHAT_QUEUE_WAIT_TIMEOUT_MS = 20_000;
const DEFAULT_SESSION_KEY_HEADER_NAME = 'x-copilot-share-session-key';

let webServer: http.Server | undefined;
let serverUrl: string | undefined;
let lanUrls: string[] = [];
let onServerStateChanged: (() => void) | undefined;
let accessCode: string | undefined;
let accessControlEnabled = true;
let inFlightChatRequests = 0;
const sessionRequestTails = new Map<string, Promise<void>>();

type ChatConcurrencyPermit = {
	release: () => void;
};

type PendingChatPermit = {
	resolve: (permit: ChatConcurrencyPermit) => void;
	reject: (error: Error) => void;
	timeout: NodeJS.Timeout;
};

const pendingChatPermits: PendingChatPermit[] = [];

class ChatCapacityError extends Error {}

type ServerStartResult = {
	localUrl: string;
	networkUrls: string[];
	usedPort: number;
	accessControlEnabled: boolean;
};

type StartWebServerOptions = {
	accessControlEnabled?: boolean;
};

type ServerRuntimeState = {
	isRunning: boolean;
	localUrl: string | null;
	networkUrls: string[];
	usedPort: number | null;
	statusText: string;
	hasAccessCode: boolean;
	accessControlEnabled: boolean;
};

export function getNetworkStates():any {
	return {
		webServer: webServer,
		serverUrl: serverUrl,
		lanUrls: lanUrls,
		hasAccessCode: Boolean(accessCode),
		accessControlEnabled,
		chatConcurrency: {
			inFlight: inFlightChatRequests,
			queued: pendingChatPermits.length,
			maxConcurrent: getMaxConcurrentChatRequests()
		}
	};
}

export function getCurrentAccessCode(): string {
	if (!accessCode) {
		accessCode = generateAccessCode();
	}
	return accessCode;
}

export function regenerateAccessCode(): string {
	accessCode = generateAccessCode();
	notifyServerStateChanged();
	return accessCode;
}

export function setAccessCode(code: string): string {
	const normalized = String(code || '').trim();
	if (!normalized) {
		throw new Error('Access code cannot be empty.');
	}

	accessCode = normalized;
	notifyServerStateChanged();
	return accessCode;
}

export function setAccessControlEnabled(enabled: boolean): void {
	accessControlEnabled = Boolean(enabled);
	notifyServerStateChanged();
}

export function setServerStateChangeHandler(handler?: () => void): void {
	onServerStateChanged = handler;
}

export function isServerRunning(): { isRunning: boolean; usedPort: number | null } {
	const activeAddress = webServer?.address();
	const usedPort = activeAddress && typeof activeAddress !== 'string' ? activeAddress.port : null;
	const isRunning = Boolean(webServer && serverUrl && usedPort !== null);

	return {
		isRunning,
		usedPort
	};
}

export function getServerRuntimeState(extensionNameForUi: string): ServerRuntimeState {
	const { isRunning, usedPort } = isServerRunning();

	if (isRunning) {
		return {
			isRunning,
			localUrl: serverUrl ?? null,
			networkUrls: lanUrls,
			usedPort,
			statusText: `${extensionNameForUi} is running on port ${usedPort}.`,
			hasAccessCode: Boolean(accessCode),
			accessControlEnabled
		};
	}

	return {
		isRunning: false,
		localUrl: null,
		networkUrls: [],
		usedPort: null,
		statusText: `${extensionNameForUi} is stopped.`,
		hasAccessCode: Boolean(accessCode),
		accessControlEnabled
	};
}

export async function startWebServer(
	context: vscode.ExtensionContext,
	options: StartWebServerOptions = {}
): Promise<ServerStartResult> {
	if (typeof options.accessControlEnabled === 'boolean') {
		accessControlEnabled = options.accessControlEnabled;
	}

	if (webServer && serverUrl) {
		const activeAddress = webServer.address();
		const activePort = activeAddress && typeof activeAddress !== 'string' ? activeAddress.port : getConfiguredStartPort();
		return {
			localUrl: serverUrl,
			networkUrls: lanUrls,
			usedPort: activePort,
			accessControlEnabled
		};
	}

	const webRoot = context.asAbsolutePath(path.join('src', 'webapp'));
	const startPort = getConfiguredStartPort();
	const { server, port } = await createServerWithPortFallback(webRoot, startPort);
	// Rotate access code on every cold start when access control is enabled.
	if (accessControlEnabled) {
		accessCode = generateAccessCode();
	} else if (!accessCode) {
		accessCode = generateAccessCode();
	}

	webServer = server;
	serverUrl = `http://127.0.0.1:${port}`;
	const preferredLanIp = await getPreferredLanIp();
	debugLog(`Preferred LAN IP: ${preferredLanIp ?? 'none'}`);
	lanUrls = getLanUrls(port, preferredLanIp);
	debugLog(`LAN URLs: ${lanUrls.length > 0 ? lanUrls.join(', ') : 'none'}`);

	server.on('close', () => {
		webServer = undefined;
		serverUrl = undefined;
		lanUrls = [];
		resetChatConcurrencyState();
		sessionRequestTails.clear();
		notifyServerStateChanged();
	});

	notifyServerStateChanged();

	return {
		localUrl: serverUrl,
		networkUrls: lanUrls,
		usedPort: port,
		accessControlEnabled
	};
}

export async function stopWebServer(): Promise<void> {
	if (!webServer) {
		notifyServerStateChanged();
		return;
	}

	const currentServer = webServer;
	await new Promise<void>((resolve, reject) => {
		currentServer.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});

	notifyServerStateChanged();
}

function notifyServerStateChanged(): void {
	onServerStateChanged?.();
}

async function handleRequest(
	request: http.IncomingMessage,
	response: http.ServerResponse,
	webRoot: string
): Promise<void> {
	try {
		const method = request.method ?? 'GET';
		const url = new URL(request.url ?? '/', 'http://127.0.0.1');
		const requestBody = method === 'POST' && url.pathname.startsWith('/api/')
			? await readJsonBody(request)
			: {};

		await runWithSessionScheduling(request, requestBody, async () => {
			if (method === 'POST' && url.pathname === '/api/access-code/verify') {
				await handleAuthVerifyRequest(response, requestBody);
				return;
			}

			if (isAccessControlRequiredPath(url.pathname) && accessControlEnabled && !isAuthorizedRequest(request)) {
				sendJson(response, 401, {
					error: 'Unauthorized: valid access code required.'
				});
				return;
			}

			if (method === 'POST' && url.pathname === '/api/chat') {
				await handleChatRequest(response, requestBody);
				return;
			}

			if (method === 'POST' && url.pathname === '/api/chat/reset') {
				await handleChatResetRequest(response, requestBody);
				return;
			}

			if (method === 'POST' && url.pathname === '/api/chat/clone-context') {
				await handleChatCloneContextRequest(response, requestBody);
				return;
			}

			if (method === 'POST' && url.pathname === '/api/chat/rebuild-context') {
				await handleChatRebuildContextRequest(response, requestBody);
				return;
			}

			if (method === 'GET' && url.pathname === '/api/models') {
				await handleModelsRequest(response);
				return;
			}

			if (method === 'GET' && url.pathname === '/api/server-info') {
				handleServerInfoRequest(response);
				return;
			}

			if (method === 'GET') {
				await handleStaticRequest(url.pathname, response, webRoot);
				return;
			}

			sendJson(response, 405, { error: 'Method not allowed' });
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		debugLog(`handle requrest failed, error : ${message}`);
		sendJson(response, 500, { error: message });
	}
}

async function handleAuthVerifyRequest(
	response: http.ServerResponse,
	body: Record<string, unknown>
): Promise<void> {
	if (!accessControlEnabled) {
		sendJson(response, 200, { ok: true, accessControlEnabled: false });
		return;
	}

	const submittedAccessCode = typeof body.accessCode === 'string' ? body.accessCode.trim() : '';
	if (!submittedAccessCode) {
		sendJson(response, 400, { error: 'accessCode is required.' });
		return;
	}

	if (isAccessCodeValid(submittedAccessCode)) {
		sendJson(response, 200, { ok: true });
		return;
	}

	sendJson(response, 401, { ok: false, error: 'Invalid access code.' });
}

async function handleChatRequest(
	response: http.ServerResponse,
	body: Record<string, unknown>
): Promise<void> {
	const sessionId = typeof body.sessionId === 'string' ? body.sessionId : 'unknown-session';
	const modelId = typeof body.modelId === 'string' ? body.modelId : undefined;
	const requestType = typeof body.requestType === 'string' ? body.requestType.trim().toLowerCase() : '';
	const stream = body.stream === true;
	const summarizeSession = body.summarizeSession === true || requestType === 'session-summary';
	const promptPolish = requestType === 'prompt-polish';
	const summarySource = typeof body.summarySource === 'string' ? body.summarySource.trim() : '';
	const userMessage = typeof body.message === 'string' ? body.message.trim() : '';
	if (!userMessage && !(summarizeSession && summarySource)) {
		sendJson(response, 400, {
			sessionId,
			error: 'Message is required.'
		});
		return;
	}

	if (stream && promptPolish) {
		sendJson(response, 400, {
			sessionId,
			error: 'Prompt polish requests do not support stream mode.'
		});
		return;
	}

	let chatPermit: ChatConcurrencyPermit;
	try {
		chatPermit = await acquireChatConcurrencyPermit();
	} catch (error) {
		if (error instanceof ChatCapacityError) {
			sendJson(response, 503, {
				sessionId,
				error: error.message
			});
			return;
		}

		throw error;
	}

	try {
		if (stream) {
			await handleChatRequestStream(response, { sessionId, userMessage, modelId });
			return;
		}

		const messageForModel = summarizeSession ? (userMessage || summarySource) : userMessage;
		const requestOptions = summarizeSession
			? {
				mode: 'session-summary' as const,
				summarySource
			}
			: promptPolish
				? {
					mode: 'prompt-polish' as const
				}
				: undefined;

		const result = await generateChatReply(
			sessionId,
			messageForModel,
			modelId,
			undefined,
			requestOptions
		);

		sendJson(response, 200, {
			sessionId,
			reply: result.reply,
			model: result.model,
			timestamp: Date.now()
		});
	} finally {
		chatPermit.release();
	}
}

async function handleChatRequestStream(
	response: http.ServerResponse,
	requestInfo: { sessionId: string; userMessage: string; modelId?: string }
): Promise<void> {
	const { sessionId, userMessage, modelId } = requestInfo;

	response.statusCode = 200;
	response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
	response.setHeader('Cache-Control', 'no-cache, no-transform');
	response.setHeader('Connection', 'keep-alive');
	response.setHeader('X-Accel-Buffering', 'no');
	response.flushHeaders?.();

	try {
		const result = await generateChatReply(
			sessionId,
			userMessage,
			modelId,
			async (chunk) => {
				if (!chunk) {
					return;
				}
				sendNdjsonEvent(response, {
					type: 'delta',
					delta: chunk
				});
			}
		);

		sendNdjsonEvent(response, {
			type: 'done',
			sessionId,
			reply: result.reply,
			model: result.model,
			timestamp: Date.now()
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendNdjsonEvent(response, {
			type: 'error',
			sessionId,
			error: message,
			timestamp: Date.now()
		});
	}

	response.end();
}

async function handleModelsRequest(response: http.ServerResponse): Promise<void> {
	try {
		const models = await listCopilotChatModels();
		sendJson(response, 200, {
			vendor: 'copilot',
			models
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendJson(response, 500, { error: message });
	}
}

async function handleChatResetRequest(
	response: http.ServerResponse,
	body: Record<string, unknown>
): Promise<void> {
	const clearAll = body.clearAll === true;

	if (clearAll) {
		const clearedCount = clearAllSessionHistory();
		sendJson(response, 200, {
			cleared: true,
			clearAll: true,
			clearedCount
		});
		return;
	}

	const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
	if (!sessionId) {
		sendJson(response, 400, {
			error: 'sessionId is required unless clearAll is true.'
		});
		return;
	}

	const normalizedSessionId = normalizeSessionRequestKey(sessionId);
	const existed = await clearSessionHistory(normalizedSessionId);
	sendJson(response, 200, {
		cleared: true,
		clearAll: false,
		sessionId: normalizedSessionId,
		hadHistory: existed
	});
}

async function handleChatCloneContextRequest(
	response: http.ServerResponse,
	body: Record<string, unknown>
): Promise<void> {
	const sourceSessionId = typeof body.sourceSessionId === 'string' ? body.sourceSessionId.trim() : '';
	const targetSessionId = typeof body.targetSessionId === 'string' ? body.targetSessionId.trim() : '';

	if (!sourceSessionId || !targetSessionId) {
		sendJson(response, 400, {
			error: 'sourceSessionId and targetSessionId are required.'
		});
		return;
	}

	const normalizedSourceSessionId = normalizeSessionRequestKey(sourceSessionId);
	const normalizedTargetSessionId = normalizeSessionRequestKey(targetSessionId);
	const result = await cloneSessionContext(normalizedSourceSessionId, normalizedTargetSessionId);
	sendJson(response, 200, {
		cloned: true,
		sourceSessionId: normalizedSourceSessionId,
		targetSessionId: normalizedTargetSessionId,
		historyCopied: result.historyCopied,
		summaryCopied: result.summaryCopied
	});
}

async function handleChatRebuildContextRequest(
	response: http.ServerResponse,
	body: Record<string, unknown>
): Promise<void> {
	const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
	const turnsInput = Array.isArray(body.turns) ? body.turns : [];

	if (!sessionId) {
		sendJson(response, 400, {
			error: 'sessionId is required.'
		});
		return;
	}

	const turns = turnsInput.flatMap((turn): Array<{ role: 'user' | 'assistant'; content: string }> => {
		if (!turn || typeof turn !== 'object') {
			return [];
		}

		const roleRaw = (turn as { role?: unknown }).role;
		const contentRaw = (turn as { content?: unknown }).content;
		const role = roleRaw === 'assistant' || roleRaw === 'user' ? roleRaw : '';
		const content = typeof contentRaw === 'string' ? contentRaw : '';

		if (!role || !content.trim()) {
			return [];
		}

		return [{ role, content }];
	});

	const normalizedSessionId = normalizeSessionRequestKey(sessionId);
	const result = await rebuildSessionContext(normalizedSessionId, turns);
	sendJson(response, 200, {
		rebuilt: result.rebuilt,
		sessionId: normalizedSessionId,
		turnCount: result.turnCount
	});
}

function handleServerInfoRequest(response: http.ServerResponse): void {
	const activeAddress = webServer?.address();
	const usedPort = activeAddress && typeof activeAddress !== 'string' ? activeAddress.port : null;

	sendJson(response, 200, {
		localUrl: serverUrl ?? null,
		lanUrls,
		usedPort,
		accessControlEnabled,
		sessionScheduling: {
			headerName: getConfiguredSessionKeyHeaderName() || null
		},
		chatConcurrency: {
			inFlight: inFlightChatRequests,
			queued: pendingChatPermits.length,
			maxConcurrent: getMaxConcurrentChatRequests()
		}
	});
}

async function handleStaticRequest(
	pathname: string,
	response: http.ServerResponse,
	webRoot: string
): Promise<void> {
	const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.replace(/^\//, ''));
	const normalizedPath = path.normalize(requested);

	if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
		sendText(response, 403, 'Forbidden');
		return;
	}

	const filePath = path.join(webRoot, normalizedPath);
	const stat = await fs.stat(filePath).catch(() => undefined);

	if (!stat || !stat.isFile()) {
		sendText(response, 404, 'Not found');
		return;
	}

	const content = await fs.readFile(filePath);
	response.statusCode = 200;
	response.setHeader('Content-Type', getContentType(filePath));
	response.end(content);
}

async function readJsonBody(request: http.IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	let total = 0;

	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		total += buffer.byteLength;
		if (total > MAX_BODY_SIZE) {
			throw new Error('Request body too large');
		}
		chunks.push(buffer);
	}

	if (chunks.length === 0) {
		return {};
	}

	const raw = Buffer.concat(chunks).toString('utf8');
	const parsed = JSON.parse(raw) as unknown;

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Invalid JSON payload');
	}

	return parsed as Record<string, unknown>;
}

function getContentType(filePath: string): string {
	const extension = path.extname(filePath).toLowerCase();

	switch (extension) {
		case '.html':
			return 'text/html; charset=utf-8';
		case '.js':
			return 'application/javascript; charset=utf-8';
		case '.css':
			return 'text/css; charset=utf-8';
		case '.json':
			return 'application/json; charset=utf-8';
		case '.svg':
			return 'image/svg+xml';
		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.ico':
			return 'image/x-icon';
		default:
			return 'text/plain; charset=utf-8';
	}
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: Record<string, unknown>) {
	response.statusCode = statusCode;
	response.setHeader('Content-Type', 'application/json; charset=utf-8');
	response.end(JSON.stringify(payload));
}

function sendText(response: http.ServerResponse, statusCode: number, body: string) {
	response.statusCode = statusCode;
	response.setHeader('Content-Type', 'text/plain; charset=utf-8');
	response.end(body);
}

function sendNdjsonEvent(response: http.ServerResponse, payload: Record<string, unknown>): void {
	response.write(`${JSON.stringify(payload)}\n`);
}

function generateAccessCode(): string {
	return crypto.randomBytes(18).toString('base64url');
}

function isAuthorizedRequest(request: http.IncomingMessage): boolean {
	const submittedAccessCode = readBearerAccessCode(request);
	if (!submittedAccessCode) {
		return false;
	}

	return isAccessCodeValid(submittedAccessCode);
}

function isAccessControlRequiredPath(pathname: string): boolean {
	return pathname === '/api/chat'
		|| pathname === '/api/chat/reset'
		|| pathname === '/api/chat/clone-context'
		|| pathname === '/api/chat/rebuild-context';
}

function readBearerAccessCode(request: http.IncomingMessage): string {
	const header = request.headers.authorization;
	if (typeof header !== 'string') {
		return '';
	}

	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	if (!match) {
		return '';
	}

	return match[1].trim();
}

function isAccessCodeValid(submittedAccessCode: string): boolean {
	const expected = accessCode;
	if (!expected) {
		return false;
	}

	const submittedBuffer = Buffer.from(submittedAccessCode);
	const expectedBuffer = Buffer.from(expected);
	if (submittedBuffer.byteLength !== expectedBuffer.byteLength) {
		return false;
	}

	return crypto.timingSafeEqual(submittedBuffer, expectedBuffer);
}


function getLanUrls(port: number, preferredIp?: string | null): string[] {
	const interfaces = os.networkInterfaces();
	debugLog(`Network interfaces discovered: ${Object.keys(interfaces).join(', ') || 'none'}`);
	const urls = new Set<string>();

	for (const infos of Object.values(interfaces)) {
		if (!infos) {
			continue;
		}

		for (const info of infos) {
			if (info.family === 'IPv4' && !info.internal) {
				urls.add(`http://${info.address}:${port}`);
			}
		}
	}

	const list = Array.from(urls);
	if (preferredIp) {
		const preferredUrl = `http://${preferredIp}:${port}`;
		if (list.includes(preferredUrl)) {
			debugLog(`Prioritizing preferred LAN URL: ${preferredUrl}`);
			return [preferredUrl, ...list.filter((url) => url !== preferredUrl)];
		}

		debugLog(`Preferred LAN URL not found in interface list: ${preferredUrl}`);
	}

	return list;
}

async function getPreferredLanIp(): Promise<string | null> {
	const routeProbeTargets = ['8.8.8.8', '1.1.1.1', '223.5.5.5'];

	for (const target of routeProbeTargets) {
		const localIp = await getLocalIpv4ForRoute(target);
		if (localIp) {
			debugLog(`Route probe ${target} -> local IPv4 ${localIp}`);
			return localIp;
		}
		debugLog(`Route probe ${target} did not resolve a local IPv4`);
	}

	return null;
}

async function getLocalIpv4ForRoute(targetIp: string): Promise<string | null> {
	return new Promise<string | null>((resolve) => {
		const socket = dgram.createSocket('udp4');
		let finished = false;
		const timeoutId = setTimeout(() => finish(null), 1200);

		const finish = (value: string | null) => {
			if (finished) {
				return;
			}
			finished = true;
			clearTimeout(timeoutId);
			socket.removeAllListeners();
			try {
				socket.close();
			} catch {
				// Ignore socket close race conditions (e.g. "Not running").
			}
			resolve(value);
		};

		socket.once('error', () => finish(null));
		socket.connect(53, targetIp, () => {
			const address = socket.address();
			if (typeof address !== 'string' && isValidIpv4(address.address)) {
				finish(address.address);
				return;
			}
			finish(null);
		});
	});
}

function isValidIpv4(candidate: string): boolean {
	const parts = candidate.split('.').map((part) => Number(part));
	return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

function getConfiguredStartPort(): number {
	const configured = vscode.workspace.getConfiguration(`${EXTENSION_ID}`).get<number>('port', 6800);
	if (!Number.isInteger(configured)) {
		return 6800;
	}

	if (configured < 1 || configured > 65535) {
		return 6800;
	}

	return configured;
}

function getMaxConcurrentChatRequests(): number {
	const configured = vscode.workspace
		.getConfiguration(`${EXTENSION_ID}`)
		.get<number>('maxConcurrentChats', DEFAULT_MAX_CONCURRENT_CHAT_REQUESTS);

	if (!Number.isInteger(configured)) {
		return DEFAULT_MAX_CONCURRENT_CHAT_REQUESTS;
	}

	return Math.min(
		MAX_MAX_CONCURRENT_CHAT_REQUESTS,
		Math.max(MIN_MAX_CONCURRENT_CHAT_REQUESTS, configured)
	);
}

function getConfiguredSessionKeyHeaderName(): string {
	const configured = vscode.workspace
		.getConfiguration(`${EXTENSION_ID}`)
		.get<string>('sessionKeyHeader', DEFAULT_SESSION_KEY_HEADER_NAME);

	if (typeof configured !== 'string') {
		return DEFAULT_SESSION_KEY_HEADER_NAME;
	}

	return configured.trim().toLowerCase();
}

function readSessionKeyFromHeader(request: http.IncomingMessage): string {
	const headerName = getConfiguredSessionKeyHeaderName();
	if (!headerName) {
		return '';
	}

	const headerValue = request.headers[headerName];
	if (Array.isArray(headerValue)) {
		for (const item of headerValue) {
			const normalized = String(item || '').trim();
			if (normalized) {
				return normalized;
			}
		}
		return '';
	}

	return typeof headerValue === 'string' ? headerValue.trim() : '';
}

function resolveSessionKeysForScheduling(
	request: http.IncomingMessage,
	body: Record<string, unknown>
): string[] {
	const keys = new Set<string>();

	const keyFromHeader = readSessionKeyFromHeader(request);
	if (keyFromHeader) {
		keys.add(normalizeSessionRequestKey(keyFromHeader));
	}

	for (const fieldName of ['sessionId', 'sourceSessionId', 'targetSessionId', 'sessionKey'] as const) {
		const raw = body[fieldName];
		if (typeof raw !== 'string') {
			continue;
		}

		const normalized = raw.trim();
		if (!normalized) {
			continue;
		}

		keys.add(normalizeSessionRequestKey(normalized));
	}

	return Array.from(keys);
}

async function runWithSessionScheduling<T>(
	request: http.IncomingMessage,
	body: Record<string, unknown>,
	task: () => Promise<T> | T
): Promise<T> {
	const keys = resolveSessionKeysForScheduling(request, body);
	if (keys.length === 0) {
		return await task();
	}

	if (keys.length === 1) {
		return enqueueSessionRequestTask(keys[0], task);
	}

	return enqueueWithSessionRequestLocks(keys, task);
}

function normalizeSessionRequestKey(sessionId: string): string {
	const normalized = String(sessionId || '').trim();
	return normalized || 'unknown-session';
}

async function enqueueSessionRequestTask<T>(sessionId: string, task: () => Promise<T> | T): Promise<T> {
	const key = normalizeSessionRequestKey(sessionId);
	const previousTail = sessionRequestTails.get(key) ?? Promise.resolve();
	let resolveCurrentTail: (() => void) | undefined;
	const currentTail = new Promise<void>((resolve) => {
		resolveCurrentTail = resolve;
	});

	sessionRequestTails.set(
		key,
		previousTail.then(
			() => currentTail,
			() => currentTail
		)
	);

	await previousTail;
	try {
		return await task();
	} finally {
		resolveCurrentTail?.();
		if (sessionRequestTails.get(key) === currentTail) {
			sessionRequestTails.delete(key);
		}
	}
}

async function enqueueWithSessionRequestLocks<T>(sessionIds: string[], task: () => Promise<T> | T): Promise<T> {
	const uniqueSessionIds = Array.from(
		new Set(sessionIds.map((sessionId) => normalizeSessionRequestKey(sessionId)))
	).sort();

	const runAtIndex = async (index: number): Promise<T> => {
		if (index >= uniqueSessionIds.length) {
			return await task();
		}

		const sessionId = uniqueSessionIds[index];
		return enqueueSessionRequestTask(sessionId, () => runAtIndex(index + 1));
	};

	return runAtIndex(0);
}

async function acquireChatConcurrencyPermit(): Promise<ChatConcurrencyPermit> {
	const maxConcurrent = getMaxConcurrentChatRequests();
	if (inFlightChatRequests < maxConcurrent && pendingChatPermits.length === 0) {
		inFlightChatRequests += 1;
		return createChatConcurrencyPermit();
	}

	if (pendingChatPermits.length >= MAX_CHAT_QUEUE_LENGTH) {
		throw new ChatCapacityError('Server is busy. Too many chat requests are queued.');
	}

	return new Promise<ChatConcurrencyPermit>((resolve, reject) => {
		const pending: PendingChatPermit = {
			resolve: (permit) => {
				resolve(permit);
			},
			reject,
			timeout: undefined as unknown as NodeJS.Timeout
		};

		pending.timeout = setTimeout(() => {
			const index = pendingChatPermits.indexOf(pending);
			if (index >= 0) {
				pendingChatPermits.splice(index, 1);
			}
			reject(new ChatCapacityError('Server is busy. Timed out while waiting for a chat slot.'));
		}, CHAT_QUEUE_WAIT_TIMEOUT_MS);

		pendingChatPermits.push(pending);
	});
}

function createChatConcurrencyPermit(): ChatConcurrencyPermit {
	let released = false;
	return {
		release: () => {
			if (released) {
				return;
			}

			released = true;
			handoffNextChatPermit();
		}
	};
}

function handoffNextChatPermit(): void {
	while (pendingChatPermits.length > 0) {
		const pending = pendingChatPermits.shift();
		if (!pending) {
			break;
		}

		clearTimeout(pending.timeout);
		if (!webServer) {
			pending.reject(new ChatCapacityError('Server is not running.'));
			continue;
		}

		pending.resolve(createChatConcurrencyPermit());
		return;
	}

	inFlightChatRequests = Math.max(0, inFlightChatRequests - 1);
}

function resetChatConcurrencyState(): void {
	inFlightChatRequests = 0;
	while (pendingChatPermits.length > 0) {
		const pending = pendingChatPermits.shift();
		if (!pending) {
			continue;
		}

		clearTimeout(pending.timeout);
		pending.reject(new ChatCapacityError('Server stopped before the request could be processed.'));
	}
}

async function createServerWithPortFallback(
	webRoot: string,
	startPort: number
): Promise<{ server: http.Server; port: number }> {
	for (let port = startPort; port <= 65535; port += 1) {
		const server = http.createServer((request, response) => {
			void handleRequest(request, response, webRoot);
		});

		server.requestTimeout = 60_000;
		server.headersTimeout = 65_000;
		server.keepAliveTimeout = 15_000;
		server.maxRequestsPerSocket = 250;
		server.on('clientError', (error, socket) => {
			debugLog(`client error: ${error.message}`);
			if (socket.writable) {
				socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
			}
		});

		try {
			await listenOnPort(server, port);
			return { server, port };
		} catch (error) {
			const portError = error as NodeJS.ErrnoException;
			if (portError.code === 'EADDRINUSE') {
				continue;
			}

			server.close();
			throw error;
		}
	}

	throw new Error('No available port found from configured value to 65535.');
}

async function listenOnPort(server: http.Server, port: number): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const onError = (error: Error) => {
			server.off('listening', onListening);
			reject(error);
		};

		const onListening = () => {
			server.off('error', onError);
			resolve();
		};

		server.once('error', onError);
		server.once('listening', onListening);
		server.listen(port, '0.0.0.0');
	});
}
