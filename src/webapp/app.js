// ====== Message search functionality ======
function clearMessageHighlights() {
	if (!messagesEl) {
		return;
	}

	const highlighted = messagesEl.querySelectorAll(".search-highlight");
	const parents = new Set();
	highlighted.forEach((element) => {
		const parent = element.parentNode;
		if (parent) {
			parents.add(parent);
		}
		element.replaceWith(document.createTextNode(element.textContent || ""));
	});

	parents.forEach((parent) => {
		if (typeof parent.normalize === "function") {
			parent.normalize();
		}
	});
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function highlightTextNodeMatches(textNode, pattern, highlights) {
	const value = textNode.nodeValue || "";
	pattern.lastIndex = 0;
	if (!pattern.test(value)) {
		return;
	}

	pattern.lastIndex = 0;
	const fragment = document.createDocumentFragment();
	let lastIndex = 0;
	let match;

	while ((match = pattern.exec(value)) !== null) {
		const startIndex = match.index;
		const matchText = match[0];
		if (startIndex > lastIndex) {
			fragment.append(value.slice(lastIndex, startIndex));
		}

		const highlight = document.createElement("span");
		highlight.className = "search-highlight";
		highlight.textContent = matchText;
		fragment.append(highlight);
		highlights.push(highlight);
		lastIndex = startIndex + matchText.length;

		if (!matchText.length) {
			break;
		}
	}

	if (lastIndex < value.length) {
		fragment.append(value.slice(lastIndex));
	}

	textNode.replaceWith(fragment);
}

function highlightMessageMatches(query) {
	clearMessageHighlights();
	if (!messagesEl || !query) {
		return [];
	}

	const pattern = new RegExp(escapeRegExp(query), "gi");
	const messageBubbles = messagesEl.querySelectorAll(".message-row .bubble");
	const highlights = [];

	messageBubbles.forEach((bubble) => {
		const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				if (!node.nodeValue || !node.nodeValue.trim()) {
					return NodeFilter.FILTER_REJECT;
				}

				if (node.parentElement && node.parentElement.closest(".search-highlight")) {
					return NodeFilter.FILTER_REJECT;
				}

				return NodeFilter.FILTER_ACCEPT;
			}
		});

		const textNodes = [];
		let currentNode = walker.nextNode();
		while (currentNode) {
			textNodes.push(currentNode);
			currentNode = walker.nextNode();
		}

		textNodes.forEach((textNode) => {
			highlightTextNodeMatches(textNode, pattern, highlights);
		});
	});

	return highlights;
}

const messageSearchBarEl = document.getElementById("messageSearchBar");
const messageSearchInputEl = document.getElementById("messageSearchInput");
const messageSearchStartBtnEl = document.getElementById("messageSearchStartBtn");
const messageSearchPrevBtnEl = document.getElementById("messageSearchPrevBtn");
const messageSearchNextBtnEl = document.getElementById("messageSearchNextBtn");
const messageSearchMatchInfoEl = document.getElementById("messageSearchMatchInfo");
const closeMessageSearchBtnEl = document.getElementById("closeMessageSearchBtn");
const dialogHeaderSearchBtnEl = document.getElementById("dialogHeaderSearchBtn");

let searchMatches = [];
let currentMatchIdx = -1;

function updateSearchNavigationState() {
	const hasMatches = searchMatches.length > 0;
	if (messageSearchPrevBtnEl) {
		messageSearchPrevBtnEl.disabled = !hasMatches;
	}
	if (messageSearchNextBtnEl) {
		messageSearchNextBtnEl.disabled = !hasMatches;
	}
}


function updateSearchMatchInfo() {
	if (!messageSearchMatchInfoEl) {
		return;
	}

	if (!searchMatches.length || currentMatchIdx < 0) {
		messageSearchMatchInfoEl.textContent = "0/0";
		return;
	}

	messageSearchMatchInfoEl.textContent = `${currentMatchIdx + 1}/${searchMatches.length}`;
}

function setCurrentSearchMatch(index, { scroll = true } = {}) {
	searchMatches.forEach((match) => {
		match.classList.remove("search-highlight-current");
	});

	if (!searchMatches.length) {
		currentMatchIdx = -1;
		updateSearchMatchInfo();
		updateSearchNavigationState();
		return;
	}

	const normalizedIndex = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
	currentMatchIdx = normalizedIndex;
	const activeMatch = searchMatches[currentMatchIdx];
	activeMatch.classList.add("search-highlight-current");
	updateSearchMatchInfo();
	updateSearchNavigationState();

	if (scroll) {
		activeMatch.scrollIntoView({ behavior: "smooth", block: "center" });
	}
}

function refreshMessageSearch({ scrollToActive = false, resetIndex = false } = {}) {
	if (!messageSearchBarEl || messageSearchBarEl.hidden) {
		return;
	}

	const query = messageSearchInputEl ? messageSearchInputEl.value.trim() : "";
	if (!query) {
	clearMessageHighlights();
	searchMatches = [];
	currentMatchIdx = -1;
		updateSearchMatchInfo();
		updateSearchNavigationState();
		return;
	}

	const previousIndex = resetIndex ? 0 : currentMatchIdx;
	searchMatches = highlightMessageMatches(query);
	if (!searchMatches.length) {
		currentMatchIdx = -1;
		updateSearchMatchInfo();
		updateSearchNavigationState();
		return;
	}

	const nextIndex = previousIndex >= 0 ? Math.min(previousIndex, searchMatches.length - 1) : 0;
	setCurrentSearchMatch(nextIndex, { scroll: scrollToActive });
}


function openMessageSearchBar() {
	if (!messageSearchBarEl || !dialogHeaderSearchBtnEl) {
		return;
	}

	dialogHeaderSearchBtnEl.hidden = true;
	messageSearchBarEl.hidden = false;
	window.requestAnimationFrame(() => {
		if (messageSearchInputEl) {
			messageSearchInputEl.focus();
			messageSearchInputEl.select();
		}
	});
	refreshMessageSearch();
}


function closeMessageSearchBar() {
	if (!messageSearchBarEl || !dialogHeaderSearchBtnEl) {
		return;
	}

	messageSearchBarEl.hidden = true;
	dialogHeaderSearchBtnEl.hidden = false;
	if (messageSearchInputEl) {
		messageSearchInputEl.value = "";
	}
	clearMessageHighlights();
	searchMatches = [];
	currentMatchIdx = -1;
	updateSearchMatchInfo();
	updateSearchNavigationState();
	dialogHeaderSearchBtnEl.focus();
}


function runMessageSearch() {
	refreshMessageSearch({ scrollToActive: true, resetIndex: true });
	if (!searchMatches.length) {
		updateSearchMatchInfo();
	}
}


function gotoPrevMatch() {
	if (!searchMatches.length) {
		return;
	}

	setCurrentSearchMatch(currentMatchIdx - 1);
}

function gotoNextMatch() {
	if (!searchMatches.length) {
		return;
	}

	setCurrentSearchMatch(currentMatchIdx + 1);
}

if (dialogHeaderSearchBtnEl) {
	dialogHeaderSearchBtnEl.addEventListener("click", openMessageSearchBar);
}
if (closeMessageSearchBtnEl) {
	closeMessageSearchBtnEl.addEventListener("click", closeMessageSearchBar);
}
if (messageSearchStartBtnEl) {
	messageSearchStartBtnEl.addEventListener("click", runMessageSearch);
}
if (messageSearchInputEl) {
	messageSearchInputEl.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			runMessageSearch();
		}

		if (event.key === "Escape") {
			event.preventDefault();
			closeMessageSearchBar();
		}
	});
}
if (messageSearchPrevBtnEl) {
	messageSearchPrevBtnEl.addEventListener("click", gotoPrevMatch);
}
if (messageSearchNextBtnEl) {
	messageSearchNextBtnEl.addEventListener("click", gotoNextMatch);
}

updateSearchMatchInfo();
updateSearchNavigationState();
// ====== Storage keys ======
const STORAGE_KEY = "llm-dialog-sessions-v1";
const ACTIVE_KEY = "llm-dialog-active-session";
const SIDEBAR_KEY = "llm-dialog-sidebar-collapsed-v1";

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
let isSidebarCollapsed = false;

// ====== DOM references ======
const appEl = document.getElementById("app");
const newSessionBtnEl = document.getElementById("newSessionBtn");
const sessionListEl = document.getElementById("sessionList");
const dialogTitleEl = document.getElementById("dialogTitle");
const dialogSubtitleEl = document.getElementById("dialogSubtitle");
const messagesEl = document.getElementById("messages");
const promptInputEl = document.getElementById("promptInput");
const modelSelectEl = document.getElementById("modelSelect");
const clearSessionHistoryBtnEl = document.getElementById("clearSessionHistoryBtn");
const resetContextBtnEl = document.getElementById("resetContextBtn");
const dialogHeaderMenuBtnEl = document.getElementById("dialogHeaderMenuBtn");
const dialogHeaderMenuEl = document.getElementById("dialogHeaderMenu");
const cancelStreamBtnEl = document.getElementById("cancelStreamBtn");
const sendBtnEl = document.getElementById("sendBtn");
const mobileBackBtnEl = document.getElementById("mobileBackBtn");
const sidebarToggleBtnEl = document.getElementById("sidebarToggleBtn");
const sidebarEl = document.querySelector(".sidebar");

let sessionHoverPopupEl = null;

function ensureSessionHoverPopup() {
	if (sessionHoverPopupEl) {
		return sessionHoverPopupEl;
	}

	const popup = document.createElement("div");
	popup.className = "session-hover-float";
	popup.hidden = true;
	document.body.appendChild(popup);
	sessionHoverPopupEl = popup;
	return popup;
}

function hideSessionHoverPopup() {
	if (!sessionHoverPopupEl) {
		return;
	}
	sessionHoverPopupEl.classList.remove("show");
	sessionHoverPopupEl.hidden = true;
}

function showSessionHoverPopup(item) {
	if (!appEl.classList.contains("sidebar-collapsed") || !sidebarEl) {
		hideSessionHoverPopup();
		return;
	}

	const title = item.querySelector(".session-hover-title")?.textContent?.trim() || "";
	const preview = item.querySelector(".session-hover-text")?.textContent?.trim() || "";
	if (!title && !preview) {
		hideSessionHoverPopup();
		return;
	}

	const popup = ensureSessionHoverPopup();
	const titleMarkup = title ? `<div class="session-hover-title">${escapeHtml(title)}</div>` : "";
	const previewMarkup = preview ? `<div class="session-hover-text">${escapeHtml(preview)}</div>` : "";
	popup.innerHTML = `${titleMarkup}${previewMarkup}`;

	const rect = item.getBoundingClientRect();
	const left = rect.right + 10;
	const popupWidth = 220;
	const popupHalfHeight = 38;
	const minTop = 8;
	const maxTop = window.innerHeight - popupHalfHeight - 8;
	const top = Math.max(minTop, Math.min(rect.top + rect.height / 2 - popupHalfHeight, maxTop));

	popup.style.left = `${Math.min(left, window.innerWidth - popupWidth - 8)}px`;
	popup.style.top = `${top}px`;
	popup.hidden = false;
	window.requestAnimationFrame(() => {
		if (popup) {
			popup.classList.add("show");
		}
	});
}

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

function saveSidebarState() {
	localStorage.setItem(SIDEBAR_KEY, isSidebarCollapsed ? "1" : "0");
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

	isSidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === "1";
}

function applySidebarState() {
	if (!appEl) {
		return;
	}

	const isMobileLayout = window.matchMedia("(max-width: 760px)").matches;
	const shouldCollapse = isSidebarCollapsed && !isMobileLayout;
	appEl.classList.toggle("sidebar-collapsed", shouldCollapse);

	if (sidebarToggleBtnEl) {
		sidebarToggleBtnEl.setAttribute("aria-label", shouldCollapse ? "Expand sidebar" : "Collapse sidebar");
		sidebarToggleBtnEl.setAttribute("title", shouldCollapse ? "Expand sidebar" : "Collapse sidebar");
	}
}

function toggleSidebarCollapse() {
	isSidebarCollapsed = !isSidebarCollapsed;
	applySidebarState();
	hideSessionHoverPopup();
	saveSidebarState();
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

	sessionListEl.innerHTML = sessions
		.map((session) => {
			const latest = session.messages[session.messages.length - 1];
			const activeClass = session.id === activeSessionId ? "active" : "";
			const safeName = escapeHtml(session.name);
			const iconText = escapeHtml(session.name.slice(0, 1).toUpperCase() || "S");
			const previewText = getPreview(session).replace(/\s+/g, " ").trim();
			const safePreview = escapeHtml(previewText);

			return `
				<li class="session-item ${activeClass}" data-id="${session.id}" role="button" tabindex="0" aria-label="Open ${safeName}">
					<div class="session-icon">${iconText}</div>
					<div class="session-main">
						<div class="session-top">
							<span class="session-name">${safeName}</span>
							<span class="session-time">${latest ? formatTime(latest.timestamp) : ""}</span>
						</div>
						<div class="session-preview">${safePreview}</div>
					</div>
					<div class="session-actions">
						<button class="action-btn rename" type="button" data-action="rename" data-id="${session.id}" aria-label="Rename session">✎</button>
						<button class="action-btn delete" type="button" data-action="delete" data-id="${session.id}" aria-label="Delete session">🗑</button>
					</div>
					<div class="session-hover-preview" aria-hidden="true">
						<div class="session-hover-title">${safeName}</div>
						<div class="session-hover-text">${safePreview}</div>
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
		messagesEl.innerHTML = `<div class="empty">Create or select a session to start your dialog</div>`;
		return;
	}

	dialogTitleEl.textContent = active.name;

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
	clearMessageHighlights();
	if (typeof window.enhanceMarkdownContent === "function") {
		window.enhanceMarkdownContent(messagesEl);
	}
	if (typeof window.applyMarkdownCodeHighlight === "function") {
		window.applyMarkdownCodeHighlight(messagesEl);
	}
	messagesEl.scrollTop = messagesEl.scrollHeight;
	refreshMessageSearch({ scrollToActive: currentMatchIdx >= 0 });
}

function renderAll() {
	renderSessionList();
	renderMessages();
	if (typeof window.syncModelPickerForActiveSession === "function") {
		window.syncModelPickerForActiveSession();
	}
	updateInputActionStates();
}

function updateInputActionStates() {
	const hasActiveSession = Boolean(getActiveSession());
	const hasInFlightStream = hasActiveSession
		&& typeof window.isSessionStreamInFlight === "function"
		&& window.isSessionStreamInFlight(activeSessionId);
	if (resetContextBtnEl) {
		resetContextBtnEl.disabled = !hasActiveSession;
	}
	if (clearSessionHistoryBtnEl) {
		clearSessionHistoryBtnEl.disabled = !hasActiveSession;
	}
	if (cancelStreamBtnEl) {
		cancelStreamBtnEl.disabled = !hasInFlightStream;
	}
	if (sendBtnEl) {
		sendBtnEl.disabled = !hasActiveSession || hasInFlightStream;
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

	       // Confirmation is now handled in the event handler, not here.

	const originalHTML = resetContextBtnEl.innerHTML;
	resetContextBtnEl.disabled = true;
	resetContextBtnEl.innerHTML = '<span class="copilot-share-menu-item-icon icon-reset" aria-hidden="true"></span><span class="copilot-share-menu-item-text">Resetting...</span>';

	       try {
		       await window.resetChatContext({ sessionId: active.id });
		       resetContextBtnEl.innerHTML = '<span class="copilot-share-menu-item-icon icon-reset" aria-hidden="true"></span><span class="copilot-share-menu-item-text">Reset Done</span>';
		       window.setTimeout(() => {
			       if (resetContextBtnEl) {
				       resetContextBtnEl.innerHTML = originalHTML;
				       resetContextBtnEl.disabled = !getActiveSession();
			       }
		       }, 1200);
	       } catch (error) {
		       const message = error instanceof Error ? error.message : String(error);
		       console.error(`Reset failed: ${message}`);
		       resetContextBtnEl.innerHTML = originalHTML;
		       resetContextBtnEl.disabled = !getActiveSession();
	       }
}

async function clearActiveSessionHistory() {
	const active = getActiveSession();
	if (!active || !clearSessionHistoryBtnEl) {
		return;
	}

	       // Confirmation is now handled in the event handler, not here.

	const originalHTML = clearSessionHistoryBtnEl.innerHTML;
	clearSessionHistoryBtnEl.disabled = true;
	clearSessionHistoryBtnEl.innerHTML = '<span class="copilot-share-menu-item-icon icon-clear-all" aria-hidden="true"></span><span class="copilot-share-menu-item-text">Clearing...</span>';

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

	       clearSessionHistoryBtnEl.innerHTML = '<span class="copilot-share-menu-item-icon icon-clear-all" aria-hidden="true"></span><span class="copilot-share-menu-item-text">Cleared</span>';
	       window.setTimeout(() => {
		       if (clearSessionHistoryBtnEl) {
			       clearSessionHistoryBtnEl.innerHTML = originalHTML;
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

sessionListEl.addEventListener("pointerover", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}
	const item = target.closest(".session-item");
	if (!item) {
		return;
	}
	showSessionHoverPopup(item);
});

sessionListEl.addEventListener("pointerout", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}
	const item = target.closest(".session-item");
	if (!item) {
		return;
	}
	const related = event.relatedTarget;
	if (related instanceof Node && item.contains(related)) {
		return;
	}
	hideSessionHoverPopup();
});

sessionListEl.addEventListener("focusin", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}
	const item = target.closest(".session-item");
	if (!item) {
		return;
	}
	showSessionHoverPopup(item);
});

sessionListEl.addEventListener("focusout", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}
	const item = target.closest(".session-item");
	if (!item) {
		return;
	}
	const related = event.relatedTarget;
	if (related instanceof Node && item.contains(related)) {
		return;
	}
	hideSessionHoverPopup();
});

sendBtnEl.addEventListener("click", sendUserMessage);


// Dialog header menu logic
if (dialogHeaderMenuBtnEl && dialogHeaderMenuEl) {
	dialogHeaderMenuBtnEl.addEventListener("click", (e) => {
		e.stopPropagation();
		const expanded = dialogHeaderMenuBtnEl.getAttribute("aria-expanded") === "true";
		if (expanded) {
			dialogHeaderMenuEl.hidden = true;
			dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
		} else {
			dialogHeaderMenuEl.hidden = false;
			dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "true");
		}
	});
	// Hide menu on outside click
	document.addEventListener("click", (e) => {
		if (!dialogHeaderMenuEl.contains(e.target) && e.target !== dialogHeaderMenuBtnEl) {
			dialogHeaderMenuEl.hidden = true;
			if (dialogHeaderMenuBtnEl) {
				dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
			}
		}
	});

	// Reset Context button event (now in dialog-header menu) with confirmation
	if (resetContextBtnEl) {
		resetContextBtnEl.addEventListener("click", () => {
			const ok = window.confirm("Are you sure you want to clear the context for this session?");
			if (!ok) {
				// Always close the menu if user cancels, to prevent repeated popups
				if (dialogHeaderMenuEl) {
					dialogHeaderMenuEl.hidden = true;
					if (dialogHeaderMenuBtnEl) {
						dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
					}
				}
				return;
			}
			void resetActiveSessionContext();
			if (dialogHeaderMenuEl) {
				dialogHeaderMenuEl.hidden = true;
				if (dialogHeaderMenuBtnEl) {
					dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
				}
			}
		});
	}
}


// Clear Session button event (now in dialog-header menu)
if (clearSessionHistoryBtnEl) {
	clearSessionHistoryBtnEl.addEventListener("click", () => {
		const ok = window.confirm("Are you sure you want to clear all messages in this session?");
		if (!ok) {
			return;
		}
		void clearActiveSessionHistory();
		if (dialogHeaderMenuEl) {
			dialogHeaderMenuEl.hidden = true;
			if (dialogHeaderMenuBtnEl) {
				dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
			}
		}
	});
}

if (cancelStreamBtnEl) {
	cancelStreamBtnEl.addEventListener("click", () => {
		const active = getActiveSession();
		if (!active || typeof window.cancelUserSend !== "function") {
			return;
		}
		window.cancelUserSend(active.id);
	});
}

window.onSessionStreamStateChanged = function onSessionStreamStateChanged() {
	updateInputActionStates();
};

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
	applySidebarState();
	hideSessionHoverPopup();
});

window.addEventListener("scroll", hideSessionHoverPopup, { passive: true });

if (sidebarToggleBtnEl) {
	sidebarToggleBtnEl.addEventListener("click", toggleSidebarCollapse);
}

// ====== Bootstrapping ======
loadState();
if (!sessions.length) {
	createSession("New Session");
}
if (typeof window.initCopilotSharePanel === "function") {
	void window.initCopilotSharePanel();
}
applySidebarState();
renderAll();
