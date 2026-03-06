import * as vscode from 'vscode';
import * as http from 'http';
import * as path from 'path';
import * as os from 'os';
import * as dgram from 'dgram';
import { promises as fs } from 'fs';

let webServer: http.Server | undefined;
let serverUrl: string | undefined;
let lanUrls: string[] = [];
let statusBarItem: vscode.StatusBarItem | undefined;

const MAX_BODY_SIZE = 1024 * 1024;

type ServerStartResult = {
	localUrl: string;
	networkUrls: string[];
	usedPort: number;
};

type MenuAction = 'start' | 'stop' | 'open' | 'copyLocal' | 'copyLan';

type ControlMenuItem = vscode.QuickPickItem & {
	action?: MenuAction;
};

const DEBUG_PREFIX = '[copilot-sharing]';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "copilot-sharing" is now active!');
	const openMenuCommand = 'copilot-sharing.open-control-menu';

	const openControlMenuCommand = vscode.commands.registerCommand(openMenuCommand, async () => {
		await openControlMenu(context);
	});

	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.name = 'Copilot Sharing Controls';
	statusBarItem.command = openMenuCommand;
	updateStatusBarItem();
	statusBarItem.show();

	context.subscriptions.push(openControlMenuCommand, statusBarItem);
	context.subscriptions.push(new vscode.Disposable(() => {
		void stopWebServer();
	}));
}

export async function deactivate() {
	await stopWebServer();
}

function getServerRuntimeState(): {
	isRunning: boolean;
	localUrl: string | null;
	networkUrls: string[];
	usedPort: number | null;
	statusText: string;
} {
	const activeAddress = webServer?.address();
	const usedPort = activeAddress && typeof activeAddress !== 'string' ? activeAddress.port : null;
	const isRunning = Boolean(webServer && serverUrl && usedPort !== null);

	if (isRunning) {
		return {
			isRunning,
			localUrl: serverUrl ?? null,
			networkUrls: lanUrls,
			usedPort,
			statusText: `Copilot Sharing started on port ${usedPort}.`
		};
	}

	return {
		isRunning: false,
		localUrl: null,
		networkUrls: [],
		usedPort: null,
		statusText: 'Copilot Sharing is stopped.'
	};
}

function updateStatusBarItem(): void {
	if (!statusBarItem) {
		return;
	}

	const state = getServerRuntimeState();
	if (state.isRunning && state.usedPort !== null) {
		statusBarItem.text = `$(broadcast) Copilot Sharing`;
		statusBarItem.tooltip = `${state.statusText}\nClick to open Copilot Sharing controls.`;
		return;
	}

	statusBarItem.text = '$(circle-slash) Copilot Sharing';
	statusBarItem.tooltip = `${state.statusText}\nClick to open Copilot Sharing controls.`;
}

async function openControlMenu(context: vscode.ExtensionContext): Promise<void> {
	while (true) {
		const state = getServerRuntimeState();
		const items: ControlMenuItem[] = [
			{ label: 'Server', kind: vscode.QuickPickItemKind.Separator },
			{
				label: state.isRunning ? '$(check) HTTP server: Running' : '$(circle-slash) HTTP server: Stopped',
				detail: state.statusText
			},
			{ label: '$(play) Start server', action: 'start' },
			{ label: '$(debug-stop) Stop server', action: 'stop' },
			{ label: 'Links', kind: vscode.QuickPickItemKind.Separator },
			{ label: '$(globe) Open web', action: 'open' },
			{ label: '$(copy) Copy Local URL', action: 'copyLocal' },
			{ label: '$(copy) Copy LAN URL', action: 'copyLan' }
		];

		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: 'Copilot Sharing Controls',
			matchOnDescription: true,
			matchOnDetail: true
		});

		if (!picked) {
			return;
		}

		switch (picked.action) {
			case 'start': {
				const started = await startWebServer(context);
				updateStatusBarItem();
				void vscode.window.showInformationMessage(`Copilot Sharing server started on port ${started.usedPort}.`);
				break;
			}
			case 'stop':
				await stopWebServer();
				updateStatusBarItem();
				void vscode.window.showInformationMessage('Copilot Sharing server stopped.');
				break;
			case 'open': {
				const latestState = getServerRuntimeState();
				if (!latestState.localUrl) {
					void vscode.window.showWarningMessage('Server is not running. Start the server first.');
					break;
				}

				await vscode.env.openExternal(vscode.Uri.parse(latestState.localUrl));
				break;
			}
			case 'copyLocal': {
				const latestState = getServerRuntimeState();
				if (!latestState.localUrl) {
					void vscode.window.showWarningMessage('Server is not running. Start the server first.');
					break;
				}

				await vscode.env.clipboard.writeText(latestState.localUrl);
				void vscode.window.showInformationMessage(`Copied: ${latestState.localUrl}`);
				break;
			}
			case 'copyLan': {
				const latestState = getServerRuntimeState();
				if (latestState.networkUrls.length === 0) {
					void vscode.window.showWarningMessage('No LAN IPv4 URL is currently available to copy.');
					break;
				}

				await vscode.env.clipboard.writeText(latestState.networkUrls[0]);
				void vscode.window.showInformationMessage(`Copied: ${latestState.networkUrls[0]}`);
				break;
			}
			default:
				break;
		}
	}
}

async function startWebServer(context: vscode.ExtensionContext): Promise<ServerStartResult> {
	if (webServer && serverUrl) {
		const activeAddress = webServer.address();
		const activePort = activeAddress && typeof activeAddress !== 'string' ? activeAddress.port : getConfiguredStartPort();
		return {
			localUrl: serverUrl,
			networkUrls: lanUrls,
			usedPort: activePort
		};
	}

	const webRoot = context.asAbsolutePath(path.join('src', 'webapp'));
	const startPort = getConfiguredStartPort();
	const { server, port } = await createServerWithPortFallback(webRoot, startPort);

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
		updateStatusBarItem();
	});

	updateStatusBarItem();

	return {
		localUrl: serverUrl,
		networkUrls: lanUrls,
		usedPort: port
	};
}

async function stopWebServer(): Promise<void> {
	if (!webServer) {
		updateStatusBarItem();
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

	updateStatusBarItem();
}

async function handleRequest(
	request: http.IncomingMessage,
	response: http.ServerResponse,
	webRoot: string
): Promise<void> {
	try {
		const method = request.method ?? 'GET';
		const url = new URL(request.url ?? '/', 'http://127.0.0.1');

		if (method === 'POST' && url.pathname === '/api/chat') {
			await handleChatRequest(request, response);
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
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendJson(response, 500, { error: message });
	}
}

async function handleChatRequest(
	request: http.IncomingMessage,
	response: http.ServerResponse
): Promise<void> {
	const body = await readJsonBody(request);
	const sessionId = typeof body.sessionId === 'string' ? body.sessionId : 'unknown-session';
	const userMessage = typeof body.message === 'string' ? body.message.trim() : '';
	const reply = userMessage
		? `Server received: ${userMessage}`
		: 'Server received an empty message.';

	sendJson(response, 200, {
		sessionId,
		reply,
		timestamp: Date.now()
	});
}

function handleServerInfoRequest(response: http.ServerResponse): void {
	const activeAddress = webServer?.address();
	const usedPort = activeAddress && typeof activeAddress !== 'string' ? activeAddress.port : null;

	sendJson(response, 200, {
		localUrl: serverUrl ?? null,
		lanUrls,
		usedPort
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

function debugLog(message: string): void {
	console.log(`${DEBUG_PREFIX} ${message}`);
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
	const configured = vscode.workspace.getConfiguration('copilot-sharing').get<number>('port', 6800);
	if (!Number.isInteger(configured)) {
		return 6800;
	}

	if (configured < 1 || configured > 65535) {
		return 6800;
	}

	return configured;
}

async function createServerWithPortFallback(
	webRoot: string,
	startPort: number
): Promise<{ server: http.Server; port: number }> {
	for (let port = startPort; port <= 65535; port += 1) {
		const server = http.createServer((request, response) => {
			void handleRequest(request, response, webRoot);
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
