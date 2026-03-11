import * as vscode from 'vscode';
import {EXTENSION_ID, debugLog} from './helper';
import { debug } from 'console';

const SYSTEM_PROMPT =
	'You are Copilot Share, a concise and helpful assistant. Answer clearly, stay on-topic, and use the conversation history to keep context.';
const HISTORY_TURNS_TO_KEEP = 8;
const FILTERED_MODEL_IDS = new Set([
	'copilot-fast', // model name: "GPT-4o mini", filted out due to small max token and invisibility from vscode copilot 
	'gpt-4o-mini'   // model name: "GPT-4o mini", filted out due to small max token and invisibility from vscode copilot 
]);

export type ChatModelInfo = {
	id: string;
	name: string;
	vendor: string;
	family: string;
	version: string;
	maxInputTokens: number;
};

type MessageRole = 'user' | 'assistant';

type ConversationTurn = {
	role: MessageRole;
	content: string;
};

const sessionHistory = new Map<string, ConversationTurn[]>();

export async function listCopilotChatModels(): Promise<ChatModelInfo[]> {
	const copilotModels = (await vscode.lm.selectChatModels({ vendor: 'copilot' }))
		.filter((model) => !FILTERED_MODEL_IDS.has(model.id));
	const infos = copilotModels.map((model) => ({
		id: model.id,
		name: model.name,
		vendor: model.vendor,
		family: model.family,
		version: model.version,
		maxInputTokens: model.maxInputTokens
	}));

	infos.sort((a, b) => {
		const byFamily = a.family.localeCompare(b.family);
		if (byFamily !== 0) {
			return byFamily;
		}
		const byName = a.name.localeCompare(b.name);
		if (byName !== 0) {
			return byName;
		}
		return a.version.localeCompare(b.version);
	});

	console.log(`[${EXTENSION_ID}] available models:`, infos);

	return infos;
}

export function clearSessionHistory(sessionId: string): boolean {
	return sessionHistory.delete(sessionId);
}

export function clearAllSessionHistory(): number {
	const cleared = sessionHistory.size;
	sessionHistory.clear();
	return cleared;
}

export async function generateChatReply(
	sessionId: string,
	userMessage: string,
	modelId?: string
): Promise<{ reply: string; model: ChatModelInfo }> {
	debugLog(`handle chat request, session id:${sessionId}, model id:${modelId}, user msg:${userMessage}`);
	const model = await selectChatModel(modelId);
	const messages = buildMessagesForSession(sessionId, userMessage);
	const modelResponse = await model.sendRequest(messages, {
		justification: 'Generate a helpful reply for a user chat message in Copilot Share.'
	});

	const streamedReply = await readModelTextResponse(modelResponse);
	const reply = streamedReply.trim() ? streamedReply : 'Model returned an empty response.';

	appendTurn(sessionId, 'user', userMessage);
	appendTurn(sessionId, 'assistant', reply);

	return {
		reply,
		model: {
			id: model.id,
			name: model.name,
			vendor: model.vendor,
			family: model.family,
			version: model.version,
			maxInputTokens: model.maxInputTokens
		}
	};
}

function buildMessagesForSession(sessionId: string, userMessage: string): vscode.LanguageModelChatMessage[] {
	const history = sessionHistory.get(sessionId) ?? [];
	const recentHistory = history.slice(-HISTORY_TURNS_TO_KEEP * 2);

	const historyMessages = recentHistory.map((turn) =>
		turn.role === 'user'
			? vscode.LanguageModelChatMessage.User(turn.content)
			: vscode.LanguageModelChatMessage.Assistant(turn.content)
	);

	return [
		vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT, 'system'),
		...historyMessages,
		vscode.LanguageModelChatMessage.User(userMessage)
	];
}

function appendTurn(sessionId: string, role: MessageRole, content: string): void {
	const history = sessionHistory.get(sessionId) ?? [];
	history.push({ role, content });

	const maxItems = HISTORY_TURNS_TO_KEEP * 2;
	if (history.length > maxItems) {
		history.splice(0, history.length - maxItems);
	}

	sessionHistory.set(sessionId, history);
}

async function selectChatModel(requestedModelId?: string): Promise<vscode.LanguageModelChat> {
	const trimmedId = typeof requestedModelId === 'string' ? requestedModelId.trim() : '';
	if (trimmedId) {
		const exactCopilot = await vscode.lm.selectChatModels({ vendor: 'copilot', id: trimmedId });
		if (exactCopilot.length > 0) {
			return exactCopilot[0];
		}
	}

	const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
	if (trimmedId && copilotModels.length > 0) {
		const found = copilotModels.find((model) => model.id === trimmedId);
		if (found) {
			return found;
		}
	}
	if (copilotModels.length > 0) {
		return copilotModels[0];
	}

	const availableModels = await vscode.lm.selectChatModels();
	if (availableModels.length > 0) {
		return availableModels[0];
	}

	debugLog(`fail to select model with id ${trimmedId}`);
	throw new Error(
		'No chat model is available. Install/sign in to GitHub Copilot Chat or another chat model provider.'
	);
}

async function readModelTextResponse(modelResponse: vscode.LanguageModelChatResponse): Promise<string> {
	let reply = '';
	for await (const chunk of modelResponse.text) {
		reply += chunk;
	}
	return reply;
}
