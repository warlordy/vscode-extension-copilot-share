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

// ====== DOM references ======
const appEl = document.getElementById("app");
const newSessionBtnEl = document.getElementById("newSessionBtn");
const sessionCountLabelEl = document.getElementById("sessionCountLabel");
const sessionListEl = document.getElementById("sessionList");
const serverUrlBoxEl = document.getElementById("serverUrlBox");
const serverUrlToggleBtnEl = document.getElementById("serverUrlToggleBtn");
const serverLanUrlValueEl = document.getElementById("serverLanUrlValue");
const serverLocalUrlValueEl = document.getElementById("serverLocalUrlValue");
const copyServerUrlBtnEl = document.getElementById("copyServerUrlBtn");
const dialogTitleEl = document.getElementById("dialogTitle");
const dialogSubtitleEl = document.getElementById("dialogSubtitle");
const messagesEl = document.getElementById("messages");
const promptInputEl = document.getElementById("promptInput");
const resetContextBtnEl = document.getElementById("resetContextBtn");
const sendBtnEl = document.getElementById("sendBtn");
const mobileBackBtnEl = document.getElementById("mobileBackBtn");
let currentLanServerUrl = "";
let markdownConfigured = false;

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

function renderAgentMarkdown(text) {
	const source = String(text || "");

	if (!window.marked || !window.DOMPurify) {
		return escapeHtml(source);
	}

	if (!markdownConfigured) {
		window.marked.setOptions({
			gfm: true,
			breaks: true
		});
		markdownConfigured = true;
	}

	const rawHtml = window.marked.parse(source);
	return window.DOMPurify.sanitize(rawHtml, {
		USE_PROFILES: { html: true },
		ADD_ATTR: ["target", "rel", "class"]
	});
}

function toSlug(value) {
	const normalized = String(value || "")
		.toLowerCase()
		.replace(/[^\w\u4e00-\u9fa5\-\s]/g, "")
		.trim()
		.replace(/\s+/g, "-");

	return normalized || "section";
}

function findAnchorTarget(root, anchorId) {
	if (!root || !anchorId) {
		return null;
	}

	if (window.CSS && typeof window.CSS.escape === "function") {
		return root.querySelector(`#${window.CSS.escape(anchorId)}`);
	}

	const safeId = anchorId.replaceAll('"', '\\"');
	return root.querySelector(`[id="${safeId}"]`);
}

function enhanceMarkdownContent(container) {
	if (!container) {
		return;
	}

	container.querySelectorAll(".bubble.markdown .md-content").forEach((markdownRoot) => {
		const usedIds = new Set();
		markdownRoot.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
			const existing = heading.getAttribute("id");
			let anchorId = existing && existing.trim() ? existing.trim() : toSlug(heading.textContent);
			let suffix = 1;
			while (usedIds.has(anchorId)) {
				suffix += 1;
				anchorId = `${toSlug(heading.textContent)}-${suffix}`;
			}

			heading.setAttribute("id", anchorId);
			heading.classList.add("md-anchor-target");
			usedIds.add(anchorId);
		});

		markdownRoot.querySelectorAll("a[href]").forEach((link) => {
			const href = String(link.getAttribute("href") || "").trim();
			if (href.startsWith("#")) {
				link.removeAttribute("target");
				link.removeAttribute("rel");

				if (link.dataset.anchorBound === "true") {
					return;
				}

				link.dataset.anchorBound = "true";
				link.addEventListener("click", (event) => {
					event.preventDefault();
					const anchorId = decodeURIComponent(href.slice(1));
					const target = findAnchorTarget(markdownRoot, anchorId);
					if (target) {
						target.scrollIntoView({ behavior: "smooth", block: "start" });
					}
				});
				return;
			}

			link.setAttribute("target", "_blank");
			link.setAttribute("rel", "noopener noreferrer");
		});

		markdownRoot.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
			checkbox.setAttribute("disabled", "true");
			checkbox.classList.add("md-task-checkbox");
		});

		markdownRoot.querySelectorAll("table").forEach((table) => {
			if (table.parentElement?.classList.contains("md-table-wrap")) {
				return;
			}

			const wrapper = document.createElement("div");
			wrapper.className = "md-table-wrap";
			table.parentNode?.insertBefore(wrapper, table);
			wrapper.appendChild(table);
		});
	});
}

function applyMarkdownCodeHighlight(container) {
	if (!window.hljs || !container) {
		return;
	}

	container.querySelectorAll(".bubble.markdown pre code").forEach((codeBlock) => {
		window.hljs.highlightElement(codeBlock);
	});
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
		messages: []
	};
	sessions.unshift(newSession);
	activeSessionId = newSession.id;
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

async function loadServerUrlInfo() {
	try {
		const response = await fetch("/api/server-info");
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const data = await response.json();
		const lanUrl = Array.isArray(data.lanUrls) && data.lanUrls.length > 0 ? String(data.lanUrls[0]) : "";
		const localUrl = typeof data.localUrl === "string" ? data.localUrl : window.location.origin;

		currentLanServerUrl = lanUrl;
		serverLanUrlValueEl.textContent = lanUrl || "Not available";
		serverLocalUrlValueEl.textContent = localUrl;
	} catch {
		currentLanServerUrl = "";
		serverLanUrlValueEl.textContent = "Not available";
		serverLocalUrlValueEl.textContent = `${window.location.origin}`;
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
	if (!active) {
		dialogTitleEl.textContent = "Select a session";
		dialogSubtitleEl.textContent = "User ↔ LLM/Agent";
		messagesEl.innerHTML = `<div class="empty">Create or select a session to start your dialog</div>`;
		return;
	}

	dialogTitleEl.textContent = active.name;
	dialogSubtitleEl.textContent = "User ↔ LLM/Agent";

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
		const bubbleContent = msg.role === "agent"
			? `<div class="md-content markdown-body">${renderAgentMarkdown(msg.text)}</div>`
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
	enhanceMarkdownContent(messagesEl);
	applyMarkdownCodeHighlight(messagesEl);
	messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderAll() {
	renderSessionList();
	renderMessages();
	if (resetContextBtnEl) {
		resetContextBtnEl.disabled = !getActiveSession();
	}
}

// ====== User actions ======
function openSession(sessionId, fromListClick = false) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return;
	}
	activeSessionId = target.id;
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
	renderAll();
	saveState();
	promptInputEl.focus();

	// Integration hook for your own request sending/parsing implementation.
	if (typeof window.onUserSend === "function") {
		window.onUserSend({
			sessionId: activeSessionId,
			text
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

promptInputEl.addEventListener("keydown", (event) => {
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		sendUserMessage();
	}
});

mobileBackBtnEl.addEventListener("click", () => {
	appEl.classList.remove("show-dialog");
});

copyServerUrlBtnEl.addEventListener("click", async () => {
	let copyTarget = currentLanServerUrl;
	if (!copyTarget) {
		copyTarget = serverLocalUrlValueEl.textContent;
	}
	if (!copyTarget) {
		return;
	}

	const text = copyServerUrlBtnEl?.textContent?.trim() || "";
	try {
		await navigator.clipboard.writeText(copyTarget);
		copyServerUrlBtnEl.textContent = "Copied";
		window.setTimeout(() => {
			copyServerUrlBtnEl.textContent = text;
		}, 1200);
	} catch {
		copyServerUrlBtnEl.textContent = "Failed";
		window.setTimeout(() => {
			copyServerUrlBtnEl.textContent = text;
		}, 1200);
	}
});

serverUrlToggleBtnEl.addEventListener("click", () => {
	const isCollapsed = serverUrlBoxEl.classList.contains("collapsed");
	serverUrlBoxEl.classList.toggle("collapsed", !isCollapsed);
	serverUrlToggleBtnEl.setAttribute("aria-expanded", String(isCollapsed));
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
void loadServerUrlInfo();
renderAll();
