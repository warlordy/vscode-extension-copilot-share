import * as vscode from 'vscode';

const STATUS_CODICON_OPTIONS = {
	eye: ['eye', 'eye-closed'],
	beaker: ['beaker', 'beaker-stop'],
	chat: ['chat-sparkle', 'chat-sparkle-error'],
	run: ['run-coverage', 'run-errors'],
	search: ['search-sparkle', 'search-stop'],
	sync: ['sync', 'sync-ignored'],
	vm: ['vm-running', 'vm-outline'],
	mute: ['unmute', 'mute'],
	radio: ['radio-tower', 'circle-slash']
} as const;

type StatusCodiconOptionKey = keyof typeof STATUS_CODICON_OPTIONS;

const STATUS_CODICON_SETTING_KEY = 'statusCodiconOption';

let selectedStatusCodiconKey: StatusCodiconOptionKey = 'vm';

type MenuAction =
	| 'start'
	| 'stop'
	| 'open'
	| 'copyLocal'
	| 'copyPublic'
	| 'copyAccessCode'
	| 'regenerateAccessCode'
	| 'setAccessCode'
	| 'accessCodeUnavailableInfo'
	| 'accessCodeDisabledInfo'
	| 'setIcons';

type ControlMenuItem = vscode.QuickPickItem & {
	action?: MenuAction;
};

type IconSelectionItem = vscode.QuickPickItem & {
	key: StatusCodiconOptionKey;
};

type StatusBarUiDependencies = {
	context: vscode.ExtensionContext;
	extensionNameForUi: string;
	openMenuCommand: string;
	isServerRunning: () => { isRunning: boolean; usedPort: number | null };
	getServerRuntimeState: () => {
		isRunning: boolean;
		localUrl: string | null;
		networkUrls: string[];
		usedPort: number | null;
		statusText: string;
		hasAccessCode: boolean;
		accessControlEnabled: boolean;
	};
	getCurrentAccessCode: () => string;
	regenerateAccessCode: () => string;
	setAccessCode: (code: string) => string;
	startWebServer: (options?: { accessControlEnabled?: boolean }) => Promise<{
		localUrl: string;
		networkUrls: string[];
		usedPort: number;
		accessControlEnabled: boolean;
	}>;
	stopWebServer: () => Promise<void>;
};

type StatusBarUiController = vscode.Disposable & {
	refresh: () => void;
};

export function createStatusBarUiController(dependencies: StatusBarUiDependencies): StatusBarUiController {
	const { context, extensionNameForUi, openMenuCommand } = dependencies;

	const storedKey = context.globalState.get<string>(STATUS_CODICON_SETTING_KEY);
	if (storedKey && isStatusCodiconOptionKey(storedKey)) {
		selectedStatusCodiconKey = storedKey;
	}

	const openControlMenuCommand = vscode.commands.registerCommand(openMenuCommand, async () => {
		await openControlMenu(dependencies, refresh);
	});

	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.name = `${extensionNameForUi} Controls`;
	statusBarItem.command = openMenuCommand;
	statusBarItem.show();

	const refresh = () => {
		updateStatusBarItem(statusBarItem, dependencies);
	};

	refresh();

	return {
		refresh,
		dispose: () => {
			openControlMenuCommand.dispose();
			statusBarItem.dispose();
		}
	};
}

function isStatusCodiconOptionKey(value: string): value is StatusCodiconOptionKey {
	return value in STATUS_CODICON_OPTIONS;
}

function updateStatusBarItem(
	statusBarItem: vscode.StatusBarItem,
	dependencies: Pick<StatusBarUiDependencies, 'extensionNameForUi' | 'getServerRuntimeState'>
): void {
	const state = dependencies.getServerRuntimeState();
	const [runningCodicon, stoppedCodicon] = STATUS_CODICON_OPTIONS[selectedStatusCodiconKey];

	if (state.isRunning && state.usedPort !== null) {
		statusBarItem.text = `$(${runningCodicon}) ${dependencies.extensionNameForUi}`;
		statusBarItem.tooltip = `${state.statusText}\nClick to open ${dependencies.extensionNameForUi} Controls.`;
		return;
	}

	statusBarItem.text = `$(${stoppedCodicon}) ${dependencies.extensionNameForUi}`;
	statusBarItem.tooltip = `${state.statusText}\nClick to open ${dependencies.extensionNameForUi} Controls.`;
}

async function openControlMenu(
	dependencies: StatusBarUiDependencies,
	refreshStatusBar: () => void
): Promise<void> {
	while (true) {
		const state = dependencies.getServerRuntimeState();
		let accessControlStatusText;
		let accessControlItems: ControlMenuItem[];
		if (!(state.isRunning)) {
			accessControlStatusText = 'Unavailable';
			accessControlItems = [
				{ label: '$(sync) Regenerate Access Code', action: 'accessCodeUnavailableInfo' },
				{ label: '$(code) Copy Access Code', action: 'accessCodeUnavailableInfo' },
				{ label: '$(edit) Set Access Code', action: 'accessCodeUnavailableInfo' }
			];
		} else if (state.accessControlEnabled) {
			accessControlStatusText = 'Enabled';
			accessControlItems = [
				{ label: '$(sync) Regenerate Access Code', action: 'regenerateAccessCode' },
				{ label: '$(code) Copy Access Code', action: 'copyAccessCode' },
				{ label: '$(edit) Set Access Code', action: 'setAccessCode' }
			];
		} else {
			accessControlStatusText = 'Disabled';
			accessControlItems = [
				{ label: '$(sync) Regenerate Access Code', action: 'accessCodeDisabledInfo' },
				{ label: '$(code) Copy Access Code', action: 'accessCodeDisabledInfo' },
				{ label: '$(edit) Set Access Code', action: 'accessCodeDisabledInfo' }
			];
		}

		const items: ControlMenuItem[] = [
			{ label: 'Service', kind: vscode.QuickPickItemKind.Separator },
			{
				label: state.isRunning ? '$(check) HTTP Service: Running' : '$(circle-slash) HTTP Service: Stopped',
				detail: `${state.statusText} Access Control is ${accessControlStatusText}.`
			},
			{ label: '$(play) Start Sharing', action: 'start' },
			{ label: '$(debug-stop) Stop Sharing', action: 'stop' },
			{ label: 'Links', kind: vscode.QuickPickItemKind.Separator },
			{ label: '$(globe) Open Web', action: 'open' },
			{ label: '$(window) Copy Local URL', action: 'copyLocal' },
			{ label: '$(multiple-windows) Copy Public URL', action: 'copyPublic' },
			{ label: `Access Control`, kind: vscode.QuickPickItemKind.Separator },
			...accessControlItems,
			{ label: 'Custom', kind: vscode.QuickPickItemKind.Separator },
			{ label: '$(paintcan) Set Status Icons', action: 'setIcons' }
		];

		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: `${dependencies.extensionNameForUi} Controls`,
			matchOnDescription: true,
			matchOnDetail: true
		});

		if (!picked) {
			return;
		}

		switch (picked.action) {
			case 'start': {
				const { isRunning } = dependencies.isServerRunning();
				if (isRunning) {
					const latestState = dependencies.getServerRuntimeState();
					const modeText = latestState.accessControlEnabled ? 'enabled' : 'disabled';
					void vscode.window.showInformationMessage(
						`${dependencies.extensionNameForUi} is already running on port ${latestState.usedPort}. Access control is ${modeText}.`
					);
					break;
				}

				const modePick = await vscode.window.showQuickPick([
					{
						label: '$(lock) Enable Access Control',
						detail: 'Web users must provide an access code when sending requests.',
						mode: 'enable'
					},
					{
						label: '$(unlock) Disable Access Control',
						detail: 'Web users can send requests without access code verification.',
						mode: 'disable'
					}
				] as Array<vscode.QuickPickItem & { mode: 'enable' | 'disable' }>, {
					placeHolder: 'Select access control mode for this sharing session',
					matchOnDescription: true,
					ignoreFocusOut: true
				});

				if (!modePick) {
					break;
				}

				const enableAccessControl = modePick.mode === 'enable';
				const started = await dependencies.startWebServer({ accessControlEnabled: enableAccessControl });
				const modeText = started.accessControlEnabled ? 'enabled' : 'disabled';
				const msg = !isRunning
					? `${dependencies.extensionNameForUi} started on port ${started.usedPort}. Access control ${modeText}.`
					: `${dependencies.extensionNameForUi} is already running on port ${started.usedPort}.`;
				void vscode.window.showInformationMessage(msg);
				break;
			}
			case 'stop': {
				const { isRunning } = dependencies.isServerRunning();
				await dependencies.stopWebServer();
				const msg = isRunning
					? `${dependencies.extensionNameForUi} has stopped.`
					: `${dependencies.extensionNameForUi} is already stopped.`;
				void vscode.window.showInformationMessage(msg);
				break;
			}
			case 'open': {
				const latestState = dependencies.getServerRuntimeState();
				if (!latestState.localUrl) {
					void vscode.window.showWarningMessage(
						`${dependencies.extensionNameForUi} is not running. Start the sharing first.`
					);
					break;
				}

				await vscode.env.openExternal(vscode.Uri.parse(latestState.localUrl));
				break;
			}
			case 'copyLocal': {
				const latestState = dependencies.getServerRuntimeState();
				if (!latestState.localUrl) {
					void vscode.window.showWarningMessage(
						`${dependencies.extensionNameForUi} is not running. Start the sharing first.`
					);
					break;
				}

				await vscode.env.clipboard.writeText(latestState.localUrl);
				void vscode.window.showInformationMessage(`Copied: ${latestState.localUrl}`);
				break;
			}
			case 'copyPublic': {
				const latestState = dependencies.getServerRuntimeState();
				if (latestState.networkUrls.length === 0) {
					void vscode.window.showWarningMessage('Public URL is unavailable to copy.');
					break;
				}

				await vscode.env.clipboard.writeText(latestState.networkUrls[0]);
				void vscode.window.showInformationMessage(`Copied: ${latestState.networkUrls[0]}`);
				break;
			}
			case 'copyAccessCode': {
				const accessCode = dependencies.getCurrentAccessCode();
				await vscode.env.clipboard.writeText(accessCode);
				void vscode.window.showInformationMessage('Access code copied.');
				break;
			}
			case 'regenerateAccessCode': {
				const accessCode = dependencies.regenerateAccessCode();
				void vscode.window.showInformationMessage(`Access code regenerated: ${accessCode}`);
				break;
			}
			case 'setAccessCode': {
				const typedAccessCode = await vscode.window.showInputBox({
					prompt: 'Set access code for LAN web clients',
					placeHolder: 'Enter an access code',
					ignoreFocusOut: true,
					value: dependencies.getCurrentAccessCode(),
					validateInput: (value) => {
						if (!String(value || '').trim()) {
							return 'Access code cannot be empty.';
						}
						return undefined;
					}
				});

				if (typeof typedAccessCode !== 'string') {
					break;
				}

				dependencies.setAccessCode(typedAccessCode);
				void vscode.window.showInformationMessage('Access code updated.');
				break;
			}
			case 'accessCodeUnavailableInfo': {
				void vscode.window.showInformationMessage(
					'Access code options are unavailable because sharing is not running. Start sharing and enable access control to use them.'
				);
				break;
			}
			case 'accessCodeDisabledInfo': {
				void vscode.window.showInformationMessage(
					'Access control is disabled for this sharing session. Stop sharing, then start again and choose Enable Access Control to use access code options.'
				);
				break;
			}
			case 'setIcons': {
				await setStatusIcons(dependencies, refreshStatusBar);
				break;
			}
			default:
				break;
		}
	}
}

async function setStatusIcons(
	dependencies: StatusBarUiDependencies,
	refreshStatusBar: () => void
): Promise<void> {
	const options = Object.entries(STATUS_CODICON_OPTIONS) as Array<
		[StatusCodiconOptionKey, readonly [string, string]]
	>;

	const items: IconSelectionItem[] = options.map(([key, [running, stopped]]) => ({
		key,
		label: `$(${running}) Running · $(${stopped}) Stopped`,
		detail: `Option: ${key}`,
		description: key === selectedStatusCodiconKey ? 'Current' : undefined
	}));

	const picked = await vscode.window.showQuickPick(items, {
		placeHolder: 'Select Status Icon Pair',
		matchOnDescription: true,
		matchOnDetail: true
	});

	if (!picked) {
		return;
	}

	if (picked.key === selectedStatusCodiconKey) {
		void vscode.window.showInformationMessage(`Status Icons Set: ${picked.key}`);
		return;
	}

	selectedStatusCodiconKey = picked.key;
	await dependencies.context.globalState.update(STATUS_CODICON_SETTING_KEY, selectedStatusCodiconKey);
	refreshStatusBar();
	void vscode.window.showInformationMessage(`Status Icons Updated: ${picked.key}`);
}
