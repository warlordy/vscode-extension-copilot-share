import * as vscode from 'vscode';

const SYSTEM_PROMPT =
	'You are Copilot Share, a concise and helpful assistant. Answer clearly, stay on-topic, and use the conversation history to keep context.';
const HISTORY_TURNS_TO_KEEP = 8;

type MessageRole = 'user' | 'assistant';

type ConversationTurn = {
	role: MessageRole;
	content: string;
};

const sessionHistory = new Map<string, ConversationTurn[]>();

export function clearSessionHistory(sessionId: string): boolean {
	return sessionHistory.delete(sessionId);
}

export function clearAllSessionHistory(): number {
	const cleared = sessionHistory.size;
	sessionHistory.clear();
	return cleared;
}

export async function generateChatReply(sessionId: string, userMessage: string): Promise<string> {
	const model = await selectCopilotChatModel();
	const messages = buildMessagesForSession(sessionId, userMessage);
	const modelResponse = await model.sendRequest(messages, {
		justification: 'Generate a helpful reply for a user chat message in Copilot Share.'
	});

	const streamedReply = await readModelTextResponse(modelResponse);
	const reply = streamedReply.trim() ? streamedReply : 'Model returned an empty response.';

	appendTurn(sessionId, 'user', userMessage);
	appendTurn(sessionId, 'assistant', reply);

	return reply;
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

async function selectCopilotChatModel(): Promise<vscode.LanguageModelChat> {
	const copilotModels = await vscode.lm.selectChatModels({ vendor: 'copilot' });
	if (copilotModels.length > 0) {
		return copilotModels[0];
	}

	const availableModels = await vscode.lm.selectChatModels();
	if (availableModels.length > 0) {
		return availableModels[0];
	}

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
