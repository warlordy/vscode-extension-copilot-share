// ====== Storage keys ======
const STORAGE_KEY = "llm-dialog-sessions-v1";
const ACTIVE_KEY = "llm-dialog-active-session";

// ====== Seed data for first launch ======
const DEFAULT_SESSIONS = [
	{
		id: "s1",
		name: "Project Planning",
		messages: [
			{ id: "m1", role: "user", text: "Help me break down this project into milestones.", timestamp: Date.now() - 1000 * 60 * 28 },
			{ id: "m2", role: "agent", text: "Sure. We can split it into discovery, implementation, and validation phases.", timestamp: Date.now() - 1000 * 60 * 27 }
		]
	},
	{
		id: "s2",
		name: "Prompt Experiments",
		messages: [
			{ id: "m3", role: "user", text: "What is a good prompt template for code review?", timestamp: Date.now() - 1000 * 60 * 120 }
		]
	}
];

// ====== App state ======
let sessions = [];
let activeSessionId = null;
let typingSessionId = null;
let typingTimeoutId = null;
let promptHistorySessionId = null;
let promptHistoryIndex = -1;
let promptHistoryDraft = "";

// ====== DOM references ======
const appEl = document.getElementById("app");
const newSessionBtnEl = document.getElementById("newSessionBtn");
const sessionCountLabelEl = document.getElementById("sessionCountLabel");
const sessionListEl = document.getElementById("sessionList");
const dialogTitleEl = document.getElementById("dialogTitle");
const dialogSubtitleEl = document.getElementById("dialogSubtitle");
const messagesEl = document.getElementById("messages");
const promptInputEl = document.getElementById("promptInput");
const modelSelectEl = document.getElementById("modelSelect");
const clearSessionHistoryBtnEl = document.getElementById("clearSessionHistoryBtn");
const resetContextBtnEl = document.getElementById("resetContextBtn");
const sendBtnEl = document.getElementById("sendBtn");
const mobileBackBtnEl = document.getElementById("mobileBackBtn");

// ====== Utility functions ======
function formatTime(timestamp) {
	const date = new Date(timestamp);
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}

function formatDateTime(timestamp) {
	const date = new Date(timestamp);
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d} ${formatTime(timestamp)}`;
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function saveState() {
	// Persist sessions + messages on each change.
	localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
	if (activeSessionId) {
		localStorage.setItem(ACTIVE_KEY, activeSessionId);
	}
}

function loadState() {
	// Load saved sessions and active session on app launch.
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored) {
		try {
			sessions = JSON.parse(stored);
		} catch {
			sessions = structuredClone(DEFAULT_SESSIONS);
		}
	} else {
		sessions = structuredClone(DEFAULT_SESSIONS);
	}

	const storedActive = localStorage.getItem(ACTIVE_KEY);
	const found = sessions.find((item) => item.id === storedActive);
	activeSessionId = found ? found.id : sessions[0]?.id || null;
}

function getActiveSession() {
	return sessions.find((item) => item.id === activeSessionId) || null;
}

function resetPromptHistoryNavigation() {
	promptHistorySessionId = null;
	promptHistoryIndex = -1;
	promptHistoryDraft = "";
}

function getUserPromptHistory(sessionId) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return [];
	}

	return target.messages
		.filter((message) => message.role === "user" && String(message.text || "").trim())
		.map((message) => String(message.text));
}

function navigatePromptHistoryByWheel(direction) {
	const active = getActiveSession();
	if (!active) {
		return false;
	}

	const history = getUserPromptHistory(active.id);
	if (!history.length) {
		return false;
	}

	const newestFirst = history.slice().reverse();
	if (promptHistorySessionId !== active.id) {
		promptHistorySessionId = active.id;
		promptHistoryIndex = -1;
		promptHistoryDraft = promptInputEl.value;
	}

	if (direction < 0) {
		if (promptHistoryIndex === -1) {
			promptHistoryDraft = promptInputEl.value;
			promptHistoryIndex = 0;
		} else if (promptHistoryIndex < newestFirst.length - 1) {
			promptHistoryIndex += 1;
		}
	} else if (direction > 0) {
		if (promptHistoryIndex === -1) {
			return true;
		}

		if (promptHistoryIndex > 0) {
			promptHistoryIndex -= 1;
		} else {
			promptHistoryIndex = -1;
			promptInputEl.value = promptHistoryDraft;
			promptInputEl.setSelectionRange(promptInputEl.value.length, promptInputEl.value.length);
			return true;
		}
	}

	const nextValue = newestFirst[promptHistoryIndex] || promptHistoryDraft;
	promptInputEl.value = nextValue;
	promptInputEl.setSelectionRange(promptInputEl.value.length, promptInputEl.value.length);
	return true;
}

function getPreview(session) {
	const last = session.messages[session.messages.length - 1];
	return last ? last.text : "No messages yet";
}

function sortSessionsByLatest() {
	sessions.sort((a, b) => {
		const aTime = a.messages[a.messages.length - 1]?.timestamp || 0;
		const bTime = b.messages[b.messages.length - 1]?.timestamp || 0;
		return bTime - aTime;
	});
}

function createSession(name) {
	const title = (name || "").trim() || `New Session ${sessions.length + 1}`;
	const newSession = {
		id: `s_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
		name: title,
		modelId: "",
		messages: []
	};
	sessions.unshift(newSession);
	activeSessionId = newSession.id;
	resetPromptHistoryNavigation();
	renderAll();
	saveState();
}

function renameSession(sessionId) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return;
	}
	const next = window.prompt("Rename session", target.name);
	if (next === null) {
		return;
	}
	const trimmed = next.trim();
	if (!trimmed) {
		return;
	}
	target.name = trimmed;
	renderAll();
	saveState();
}

function deleteSession(sessionId) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return;
	}
	const ok = window.confirm(`Delete session "${target.name}"?`);
	if (!ok) {
		return;
	}

	if (typeof window.resetChatContext === "function") {
		void window.resetChatContext({ sessionId }).catch(() => {
			// Ignore reset API failures in UI deletion flow.
		});
	}

	sessions = sessions.filter((item) => item.id !== sessionId);
	if (!sessions.length) {
		createSession("New Session");
		return;
	}

	if (activeSessionId === sessionId) {
		activeSessionId = sessions[0].id;
	}

	resetPromptHistoryNavigation();

	renderAll();
	saveState();
}

function addMessageToActiveSession(role, text) {
	const active = getActiveSession();
	if (!active) {
		return;
	}

	active.messages.push({
		id: `m_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
		role,
		text,
		timestamp: Date.now()
	});
}

function showTypingIndicator(sessionId) {
	typingSessionId = sessionId;
	if (typingTimeoutId) {
		window.clearTimeout(typingTimeoutId);
	}

	typingTimeoutId = window.setTimeout(() => {
		typingSessionId = null;
		typingTimeoutId = null;
		renderAll();
	}, 12000);
}

function hideTypingIndicator(sessionId) {
	if (typingTimeoutId) {
		window.clearTimeout(typingTimeoutId);
		typingTimeoutId = null;
	}

	if (!sessionId || typingSessionId === sessionId) {
		typingSessionId = null;
	}
}

// ====== Rendering ======
function renderSessionList() {
	sortSessionsByLatest();
	sessionCountLabelEl.textContent = `${sessions.length} sessions`;

	sessionListEl.innerHTML = sessions
		.map((session) => {
			const latest = session.messages[session.messages.length - 1];
			const activeClass = session.id === activeSessionId ? "active" : "";
			const iconText = escapeHtml(session.name.slice(0, 1).toUpperCase() || "S");

			return `
				<li class="session-item ${activeClass}" data-id="${session.id}" role="button" tabindex="0" aria-label="Open ${escapeHtml(session.name)}">
					<div class="session-icon">${iconText}</div>
					<div class="session-main">
						<div class="session-top">
							<span class="session-name">${escapeHtml(session.name)}</span>
							<span class="session-time">${latest ? formatTime(latest.timestamp) : ""}</span>
						</div>
						<div class="session-preview">${escapeHtml(getPreview(session))}</div>
					</div>
					<div class="session-actions">
						<button class="action-btn rename" type="button" data-action="rename" data-id="${session.id}" aria-label="Rename session">✎</button>
						<button class="action-btn delete" type="button" data-action="delete" data-id="${session.id}" aria-label="Delete session">🗑</button>
					</div>
				</li>
			`;
		})
		.join("");
}

function renderMessages() {
	const active = getActiveSession();
	const subtitleText = "Enjoy your session with Copilot Share!";
	if (!active) {
		dialogTitleEl.textContent = "Select a session";
		dialogSubtitleEl.textContent = subtitleText;
		messagesEl.innerHTML = `<div class="empty">Create or select a session to start your dialog</div>`;
		return;
	}

	dialogTitleEl.textContent = active.name;
	dialogSubtitleEl.textContent = subtitleText;

	if (!active.messages.length) {
		messagesEl.innerHTML = `<div class="empty">No messages yet. Type below to start.</div>`;
		return;
	}

	const parts = [];
	let lastTimeLabel = "";

	active.messages.forEach((msg) => {
		const timeLabel = formatDateTime(msg.timestamp);
		if (timeLabel !== lastTimeLabel) {
			parts.push(`<div class="time-label">${timeLabel}</div>`);
			lastTimeLabel = timeLabel;
		}

		const bubbleClass = msg.role === "agent" ? "bubble markdown" : "bubble";
		const markdownRenderer = typeof window.renderAgentMarkdown === "function" ? window.renderAgentMarkdown : escapeHtml;
		const bubbleContent = msg.role === "agent"
			? `<div class="md-content markdown-body">${markdownRenderer(msg.text)}</div>`
			: escapeHtml(msg.text);

		parts.push(`
			<div class="message-row ${msg.role}">
				${msg.role === "agent" ? `<div class="role-tag">AI</div>` : ""}
				<div class="${bubbleClass}">${bubbleContent}</div>
				${msg.role === "user" ? `<div class="role-tag">You</div>` : ""}
			</div>
		`);
	});

	if (typingSessionId === active.id) {
		parts.push(`
			<div class="message-row agent typing">
				<div class="role-tag">AI</div>
				<div class="bubble">Copilot is typing...<span class="typing-dots"><span></span><span></span><span></span></span></div>
			</div>
		`);
	}

	messagesEl.innerHTML = parts.join("");
	if (typeof window.enhanceMarkdownContent === "function") {
		window.enhanceMarkdownContent(messagesEl);
	}
	if (typeof window.applyMarkdownCodeHighlight === "function") {
		window.applyMarkdownCodeHighlight(messagesEl);
	}
	messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderAll() {
	renderSessionList();
	renderMessages();
	if (typeof window.syncModelPickerForActiveSession === "function") {
		window.syncModelPickerForActiveSession();
	}
	const hasActiveSession = Boolean(getActiveSession());
	if (resetContextBtnEl) {
		resetContextBtnEl.disabled = !hasActiveSession;
	}
	if (clearSessionHistoryBtnEl) {
		clearSessionHistoryBtnEl.disabled = !hasActiveSession;
	}
}

// ====== User actions ======
function openSession(sessionId, fromListClick = false) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return;
	}
	activeSessionId = target.id;
	resetPromptHistoryNavigation();
	renderAll();
	saveState();

	if (fromListClick && window.matchMedia("(max-width: 760px)").matches) {
		appEl.classList.add("show-dialog");
	}
}

function sendUserMessage() {
	const text = promptInputEl.value.trim();
	if (!text) {
		return;
	}
	if (!getActiveSession()) {
		return;
	}

	// Add user message to active session and persist.
	addMessageToActiveSession("user", text);
	showTypingIndicator(activeSessionId);
	promptInputEl.value = "";
	resetPromptHistoryNavigation();
	renderAll();
	saveState();
	promptInputEl.focus();

	// Integration hook for your own request sending/parsing implementation.
	if (typeof window.onUserSend === "function") {
		window.onUserSend({
			sessionId: activeSessionId,
			text,
			modelId: modelSelectEl ? String(modelSelectEl.value || "").trim() : ""
		});
	}
}

async function resetActiveSessionContext() {
	const active = getActiveSession();
	if (!active || !resetContextBtnEl) {
		return;
	}

	if (typeof window.resetChatContext !== "function") {
		console.warn("Reset API is not available.");
		return;
	}

	const ok = window.confirm(`Reset AI context for "${active.name}"? This keeps messages in this session.`);
	if (!ok) {
		return;
	}

	const originalLabel = resetContextBtnEl.textContent || "Reset Context";
	resetContextBtnEl.disabled = true;
	resetContextBtnEl.textContent = "Resetting...";

	try {
		await window.resetChatContext({ sessionId: active.id });
		resetContextBtnEl.textContent = "Reset Done";
		window.setTimeout(() => {
			if (resetContextBtnEl) {
				resetContextBtnEl.textContent = originalLabel;
				resetContextBtnEl.disabled = !getActiveSession();
			}
		}, 1200);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`Reset failed: ${message}`);
		resetContextBtnEl.textContent = originalLabel;
		resetContextBtnEl.disabled = !getActiveSession();
	}
}

async function clearActiveSessionHistory() {
	const active = getActiveSession();
	if (!active || !clearSessionHistoryBtnEl) {
		return;
	}

	const ok = window.confirm(`Clear all messages in "${active.name}"?`);
	if (!ok) {
		return;
	}

	const originalLabel = clearSessionHistoryBtnEl.textContent || "Clear Session History";
	clearSessionHistoryBtnEl.disabled = true;
	clearSessionHistoryBtnEl.textContent = "Clearing...";

	active.messages = [];
	hideTypingIndicator(active.id);
	resetPromptHistoryNavigation();
	renderAll();
	saveState();

	if (typeof window.resetChatContext === "function") {
		try {
			await window.resetChatContext({ sessionId: active.id });
		} catch {
			// Ignore reset API failures; local history is already cleared.
		}
	}

	clearSessionHistoryBtnEl.textContent = "Cleared";
	window.setTimeout(() => {
		if (clearSessionHistoryBtnEl) {
			clearSessionHistoryBtnEl.textContent = originalLabel;
			clearSessionHistoryBtnEl.disabled = !getActiveSession();
		}
	}, 1000);
}

window.startAgentMessageStream = function startAgentMessageStream(sessionId) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return "";
	}

	hideTypingIndicator(sessionId);

	const messageId = `m_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
	target.messages.push({
		id: messageId,
		role: "agent",
		text: "",
		timestamp: Date.now()
	});

	renderAll();
	saveState();
	return messageId;
};

window.updateAgentMessageStream = function updateAgentMessageStream(sessionId, messageId, text) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target || !messageId) {
		return;
	}

	const targetMessage = target.messages.find((message) => message.id === messageId && message.role === "agent");
	if (!targetMessage) {
		return;
	}

	targetMessage.text = String(text || "");
	renderAll();
	saveState();
};

window.finalizeAgentMessageStream = function finalizeAgentMessageStream(sessionId, messageId, finalText) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target || !messageId) {
		return;
	}

	const targetMessage = target.messages.find((message) => message.id === messageId && message.role === "agent");
	if (!targetMessage) {
		return;
	}

	targetMessage.text = String(finalText || targetMessage.text || "").trim();
	hideTypingIndicator(sessionId);
	renderAll();
	saveState();
};

// Public helper: call this after receiving model response in your own logic.
window.appendAgentMessage = function appendAgentMessage(sessionId, text) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target || !String(text || "").trim()) {
		return;
	}
	hideTypingIndicator(sessionId);

	target.messages.push({
		id: `m_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
		role: "agent",
		text: String(text),
		timestamp: Date.now()
	});

	renderAll();
	saveState();
};

window.getActiveSessionModelId = function getActiveSessionModelId() {
	const active = getActiveSession();
	if (!active) {
		return "";
	}
	return typeof active.modelId === "string" ? active.modelId : "";
};

window.setActiveSessionModelId = function setActiveSessionModelId(modelId) {
	const active = getActiveSession();
	if (!active) {
		return;
	}
	active.modelId = typeof modelId === "string" ? modelId : "";
	saveState();
};

// ====== Event binding ======
newSessionBtnEl.addEventListener("click", () => {
	const input = window.prompt("Session name", `New Session ${sessions.length + 1}`);
	if (input === null) {
		return;
	}
	createSession(input);
	if (window.matchMedia("(max-width: 760px)").matches) {
		appEl.classList.add("show-dialog");
	}
});

sessionListEl.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}

	const actionButton = target.closest("button[data-action]");
	if (actionButton) {
		event.stopPropagation();
		const action = actionButton.getAttribute("data-action");
		const sessionId = actionButton.getAttribute("data-id");
		if (!sessionId) {
			return;
		}
		if (action === "rename") {
			renameSession(sessionId);
		}
		if (action === "delete") {
			deleteSession(sessionId);
		}
		return;
	}

	const item = target.closest(".session-item");
	if (!item) {
		return;
	}
	openSession(item.dataset.id, true);
});

sessionListEl.addEventListener("keydown", (event) => {
	if (event.key !== "Enter" && event.key !== " ") {
		return;
	}
	const item = event.target.closest(".session-item");
	if (!item) {
		return;
	}
	event.preventDefault();
	openSession(item.dataset.id, true);
});

sendBtnEl.addEventListener("click", sendUserMessage);

if (resetContextBtnEl) {
	resetContextBtnEl.addEventListener("click", () => {
		void resetActiveSessionContext();
	});
}

if (clearSessionHistoryBtnEl) {
	clearSessionHistoryBtnEl.addEventListener("click", () => {
		void clearActiveSessionHistory();
	});
}

promptInputEl.addEventListener("keydown", (event) => {
	if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
		if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			const direction = event.key === "ArrowUp" ? -1 : 1;
			const handled = navigatePromptHistoryByWheel(direction);
			if (handled) {
				event.preventDefault();
				return;
			}
		}
	}

	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		sendUserMessage();
	}
});

promptInputEl.addEventListener("input", () => {
	if (promptHistoryIndex !== -1) {
		promptHistoryIndex = -1;
		promptHistoryDraft = promptInputEl.value;
	}
});

promptInputEl.addEventListener("wheel", (event) => {
	if (document.activeElement !== promptInputEl) {
		return;
	}

	const direction = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0;
	if (!direction) {
		return;
	}

	const handled = navigatePromptHistoryByWheel(direction);
	if (handled) {
		event.preventDefault();
	}
}, { passive: false });

mobileBackBtnEl.addEventListener("click", () => {
	appEl.classList.remove("show-dialog");
});

window.addEventListener("resize", () => {
	if (!window.matchMedia("(max-width: 760px)").matches) {
		appEl.classList.remove("show-dialog");
	}
});

// ====== Bootstrapping ======
loadState();
if (!sessions.length) {
	createSession("New Session");
}
if (typeof window.initServerUrlPanel === "function") {
	void window.initServerUrlPanel();
}
renderAll();
