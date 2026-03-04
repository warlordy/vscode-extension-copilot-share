import * as vscode from 'vscode';
import * as http from 'http';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';

let webServer: http.Server | undefined;
let serverUrl: string | undefined;
let lanUrls: string[] = [];

const MAX_BODY_SIZE = 1024 * 1024;

type ServerStartResult = {
	localUrl: string;
	networkUrls: string[];
	usedPort: number;
};

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "copilot-sharing" is now active!');

	const disposable = vscode.commands.registerCommand('copilot-sharing.start-web-server', async () => {
		try {
			const { localUrl, networkUrls, usedPort } = await startWebServer(context);
			const lanHint = networkUrls.length > 0
				? `LAN URL: ${networkUrls[0]}`
				: 'No LAN IPv4 address detected on this machine.';
			const openUrl = localUrl;
			void vscode.window.showInformationMessage(
				`Copilot Sharing server started on port ${usedPort}. Local: ${localUrl}. ${lanHint}`
			);

			const action = await vscode.window.showQuickPick(
				[
					{ label: '$(link-external) Open Web App', value: 'open' },
					{ label: '$(clippy) Copy LAN URL', value: 'copy' }
				],
				{
					title: 'Copilot Sharing Actions',
					placeHolder: 'Choose what to do next'
				}
			);

			if (action?.value === 'open') {
				await vscode.env.openExternal(vscode.Uri.parse(openUrl));
			}

			if (action?.value === 'copy' && networkUrls.length > 0) {
				await vscode.env.clipboard.writeText(networkUrls[0]);
				void vscode.window.showInformationMessage(`Copied: ${networkUrls[0]}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			void vscode.window.showErrorMessage(`Failed to start Copilot Sharing server: ${message}`);
		}
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(new vscode.Disposable(() => {
		void stopWebServer();
	}));
}

export async function deactivate() {
	await stopWebServer();
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
	lanUrls = getLanUrls(port);

	server.on('close', () => {
		webServer = undefined;
		serverUrl = undefined;
		lanUrls = [];
	});

	return {
		localUrl: serverUrl,
		networkUrls: lanUrls,
		usedPort: port
	};
}

async function stopWebServer(): Promise<void> {
	if (!webServer) {
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

function getLanUrls(port: number): string[] {
	const interfaces = os.networkInterfaces();
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

	return Array.from(urls);
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
