import * as vscode from 'vscode';
import {EXTENSION_ID, debugLog} from './helper';

const SYSTEM_PROMPT =
	'You are a concise and helpful Copilot assistant. Answer clearly, stay on-topic, and use the conversation history to keep context.';
const HISTORY_TURNS_TO_KEEP = 8;
const RECENT_TURNS_TO_KEEP_AFTER_SUMMARY = 3;
const TOKEN_ESTIMATE_CHARS_PER_TOKEN = 4;
const MESSAGE_TOKEN_OVERHEAD = 8;
const RESERVED_OUTPUT_TOKENS = 1024;
const MIN_CONTEXT_TOKEN_BUDGET = 1024;
const MAX_CONTEXT_BUDGET_RATIO = 0.75;
const SUMMARY_TRIGGER_RATIO = 0.7;
const SESSION_SUMMARY_PROMPT_LINES = [
	'Create a high-quality summary of the entire current conversation session.',
	'Return the summary in a clean, structured, and professional style suitable for later review or sharing.',
	'',
	'Requirements:',
	'1. Identify the major independent discussion topics in the session.',
	'2. Start with a short high-level overview of the whole session.',
	'3. Then provide a separate section for each major topic.',
	'4. For each topic, summarize:',
	'   - the user\'s key requests, goals, or questions',
	'   - the important answers, proposed solutions, technical decisions, or conclusions',
	'   - any remaining open issues, risks, tradeoffs, or next steps when they are clearly present',
	'5. Remove noise, repetition, filler, off-topic content, and trivial back-and-forth that does not affect the core discussion.',
	'6. Preserve important technical details such as file names, APIs, commands, configuration names, constraints, and chosen approaches when they matter.',
	'7. Do not invent facts, decisions, or requirements that are not supported by the conversation.',
	'8. Merge duplicate points and present the result in a concise but information-dense way.',
	'9. Use clear Markdown headings and bullet points for readability.',
	'10. Write with clarity and professionalism, avoiding conversational filler.',
	'',
	'Preferred output structure:',
	'- Session Overview',
	'- Topic 1',
	'- Topic 2',
	'- Topic 3',
	'- Open Items / Next Steps (only if applicable)'
];
const FILTERED_MODEL_IDS = new Set([
	// Model: "GPT-4o mini". Filtered out due to lower token limits and inconsistent visibility in VS Code Copilot.
	'copilot-fast', 
	// Model: "GPT-4o mini". Filtered out due to lower token limits and inconsistent visibility in VS Code Copilot.
	'gpt-4o-mini',   
	// Model: "Auto". Filtered out because the VS Code LM API may expose it for discovery but not support direct invocation by id ('auto').
	'auto' 
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

type ChatRequestMode = 'chat' | 'session-summary';

type GenerateChatReplyOptions = {
	mode?: ChatRequestMode;
	summarySource?: string;
};

const sessionHistory = new Map<string, ConversationTurn[]>();
const sessionSummaries = new Map<string, string>();

export function getLLMStates(): any {
	return { chatHistory: sessionHistory, chatSummaries: sessionSummaries };
}

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
	const historyDeleted = sessionHistory.delete(sessionId);
	const summaryDeleted = sessionSummaries.delete(sessionId);
	return historyDeleted || summaryDeleted;
}

export function clearAllSessionHistory(): number {
	const cleared = sessionHistory.size;
	sessionHistory.clear();
	sessionSummaries.clear();
	return cleared;
}

export async function generateChatReply(
	sessionId: string,
	userMessage: string,
	modelId?: string,
	onChunk?: (chunk: string) => void | Promise<void>,
	options?: GenerateChatReplyOptions
): Promise<{ reply: string; model: ChatModelInfo }> {
	debugLog(`handle chat request, session id:${sessionId}, model id:${modelId}, user msg:${userMessage}`);
	const model = await selectChatModel(modelId);
	const mode = options?.mode ?? 'chat';
	const messages = buildMessagesForSession(sessionId, userMessage, model.maxInputTokens, {
		mode,
		summarySource: options?.summarySource
	});
	const modelResponse = await model.sendRequest(messages, {
		justification: 'Generate a helpful reply for a user chat message in Copilot Share.'
	});

	const streamedReply = await readModelTextResponse(modelResponse, onChunk);
	const reply = streamedReply.trim() ? streamedReply : 'Model returned an empty response.';

	if (mode === 'chat') {
		appendTurn(sessionId, 'user', userMessage);
		appendTurn(sessionId, 'assistant', reply);
		await compactSessionMemoryIfNeeded(sessionId, model);
	}

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

function buildMessagesForSession(
	sessionId: string,
	userMessage: string,
	modelMaxInputTokens: number,
	options?: GenerateChatReplyOptions
): vscode.LanguageModelChatMessage[] {
	if ((options?.mode ?? 'chat') === 'session-summary') {
		return buildSessionSummaryMessages(userMessage, options?.summarySource);
	}

	const history = sessionHistory.get(sessionId) ?? [];
	const summary = sessionSummaries.get(sessionId) ?? '';
	const budget = resolveContextTokenBudget(modelMaxInputTokens);
	const systemPrompt = buildSystemPrompt(summary);
	const recentHistory = selectHistoryWithinTokenBudget(history, systemPrompt, userMessage, budget);

	const historyMessages = recentHistory.map((turn) =>
		turn.role === 'user'
			? vscode.LanguageModelChatMessage.User(turn.content)
			: vscode.LanguageModelChatMessage.Assistant(turn.content)
	);

	return [
		vscode.LanguageModelChatMessage.User(systemPrompt, 'system'),
		...historyMessages,
		vscode.LanguageModelChatMessage.User(userMessage)
	];
}

function buildSessionSummaryMessages(userMessage: string, summarySource?: string): vscode.LanguageModelChatMessage[] {
	const rawMessages = String(summarySource || userMessage || '').trim();
	const prompt = [
		...SESSION_SUMMARY_PROMPT_LINES,
		'',
		'All the messages in the current session:',
		rawMessages
	].join('\n');

	return [
		vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT, 'system'),
		vscode.LanguageModelChatMessage.User(prompt)
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

async function compactSessionMemoryIfNeeded(
	sessionId: string,
	model: vscode.LanguageModelChat
): Promise<void> {
	const history = sessionHistory.get(sessionId) ?? [];
	if (history.length <= HISTORY_TURNS_TO_KEEP * 2) {
		return;
	}

	const tokenBudget = resolveContextTokenBudget(model.maxInputTokens);
	const historyTokens = estimateTurnsTokens(history);
	if (historyTokens < Math.floor(tokenBudget * SUMMARY_TRIGGER_RATIO)) {
		return;
	}

	const recentTurnsToKeep = RECENT_TURNS_TO_KEEP_AFTER_SUMMARY * 2;
	if (history.length <= recentTurnsToKeep) {
		return;
	}

	const olderTurns = history.slice(0, history.length - recentTurnsToKeep);
	const recentTurns = history.slice(-recentTurnsToKeep);
	const priorSummary = sessionSummaries.get(sessionId) ?? '';
	const mergedSummary = await summarizeConversationHistory(model, priorSummary, olderTurns);
	if (!mergedSummary.trim()) {
		return;
	}

	sessionSummaries.set(sessionId, mergedSummary);
	sessionHistory.set(sessionId, recentTurns);
	debugLog(`session ${sessionId} history compacted: summary refreshed, kept ${recentTurns.length} recent turns`);
}

async function summarizeConversationHistory(
	model: vscode.LanguageModelChat,
	priorSummary: string,
	olderTurns: ConversationTurn[]
): Promise<string> {
	if (olderTurns.length === 0) {
		return priorSummary;
	}

	const transcript = olderTurns
		.map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
		.join('\n\n');
	const prompt = [
		'Summarize the conversation context for future assistant turns.',
		'Keep only durable facts and decisions: user goals, constraints, preferences, accepted/rejected options, and unresolved tasks.',
		'Do not include filler or conversational pleasantries.',
		'Write concise bullet points.',
		priorSummary ? `Existing summary:\n${priorSummary}` : 'Existing summary: (none)',
		`New conversation segment:\n${transcript}`
	].join('\n\n');

	try {
		const response = await model.sendRequest(
			[
				vscode.LanguageModelChatMessage.User(
					'You are maintaining compact conversation memory for a chat system.',
					'system'
				),
				vscode.LanguageModelChatMessage.User(prompt)
			],
			{ justification: 'Create compact memory of older chat history for context retention.' }
		);
		const summary = (await readModelTextResponse(response)).trim();
		if (!summary) {
			return priorSummary;
		}
		return summary;
	} catch (error) {
		debugLog(`summary generation failed: ${String(error)}`);
		return priorSummary;
	}
}

function buildSystemPrompt(summary: string): string {
	if (!summary.trim()) {
		return SYSTEM_PROMPT;
	}

	return `${SYSTEM_PROMPT}\n\nConversation memory from earlier turns:\n${summary}`;
}

function selectHistoryWithinTokenBudget(
	history: ConversationTurn[],
	systemPrompt: string,
	userMessage: string,
	maxContextTokens: number
): ConversationTurn[] {
	const selected: ConversationTurn[] = [];
	let usedTokens = estimateTextTokens(systemPrompt) + estimateTextTokens(userMessage) + MESSAGE_TOKEN_OVERHEAD * 2;

	for (let i = history.length - 1; i >= 0; i--) {
		const turn = history[i];
		const turnTokens = estimateTextTokens(turn.content) + MESSAGE_TOKEN_OVERHEAD;
		if (usedTokens + turnTokens > maxContextTokens) {
			break;
		}
		selected.unshift(turn);
		usedTokens += turnTokens;
	}

	return selected;
}

function resolveContextTokenBudget(modelMaxInputTokens: number): number {
	if (!Number.isFinite(modelMaxInputTokens) || modelMaxInputTokens <= 0) {
		return 4096;
	}

	const ratioBudget = Math.floor(modelMaxInputTokens * MAX_CONTEXT_BUDGET_RATIO);
	const reservedBudget = modelMaxInputTokens - RESERVED_OUTPUT_TOKENS;
	return Math.max(MIN_CONTEXT_TOKEN_BUDGET, Math.min(ratioBudget, reservedBudget));
}

function estimateTurnsTokens(turns: ConversationTurn[]): number {
	return turns.reduce((total, turn) => total + estimateTextTokens(turn.content) + MESSAGE_TOKEN_OVERHEAD, 0);
}

function estimateTextTokens(text: string): number {
	if (!text) {
		return 0;
	}
	return Math.ceil(text.length / TOKEN_ESTIMATE_CHARS_PER_TOKEN);
}

async function readModelTextResponse(
	modelResponse: vscode.LanguageModelChatResponse,
	onChunk?: (chunk: string) => void | Promise<void>
): Promise<string> {
	let reply = '';
	for await (const chunk of modelResponse.text) {
		reply += chunk;
		if (onChunk) {
			await onChunk(chunk);
		}
	}
	return reply;
}
