import * as vscode from 'vscode';
import {
	getServerRuntimeState,
	isServerRunning,
	setServerStateChangeHandler,
	startWebServer,
	stopWebServer,
	getNetworkStates,
	getCurrentAccessCode,
	regenerateAccessCode,
	setAccessCode
} from './network';
import { getLLMStates } from './llm';
import { createStatusBarUiController } from './ui';

const EXTENSION_NAME_FOR_UI = 'Copilot Share';
const EXTENSION_ID = 'copilot-share';
const OPEN_MENU_COMMAND = `${EXTENSION_ID}.open-control-menu`;
const DEBUG_GLOBAL_KEY = '__copilotShareDebug';

export function activate(context: vscode.ExtensionContext) {
	console.log(`[${EXTENSION_ID}] Congratulations, your extension is now active!`);

	const uiController = createStatusBarUiController({
		context,
		extensionNameForUi: EXTENSION_NAME_FOR_UI,
		openMenuCommand: OPEN_MENU_COMMAND,
		isServerRunning,
		getServerRuntimeState: () => getServerRuntimeState(EXTENSION_NAME_FOR_UI),
		getCurrentAccessCode,
		regenerateAccessCode,
		setAccessCode,
		startWebServer: () => startWebServer(context),
		stopWebServer
	});

	setServerStateChangeHandler(() => {
		uiController.refresh();
	});

	if (context.extensionMode === vscode.ExtensionMode.Development) {
		(globalThis as Record<string, unknown>)[DEBUG_GLOBAL_KEY] = {
			llm: getLLMStates,
			network: getNetworkStates,
		};
	}

	context.subscriptions.push(uiController);
	context.subscriptions.push(
		new vscode.Disposable(() => {
			setServerStateChangeHandler(undefined);
			if (context.extensionMode === vscode.ExtensionMode.Development) {
				delete (globalThis as Record<string, unknown>)[DEBUG_GLOBAL_KEY];
			}
			void stopWebServer();
		})
	);
}

export async function deactivate() {
	setServerStateChangeHandler(undefined);
	delete (globalThis as Record<string, unknown>)[DEBUG_GLOBAL_KEY];
	await stopWebServer();
}
