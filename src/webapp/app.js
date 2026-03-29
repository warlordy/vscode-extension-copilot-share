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

function highlightMessageMatches(query, { caseSensitive = false, useRegex = false, useWholeWord = false } = {}) {
	clearMessageHighlights();
	if (!messagesEl || !query) {
		return [];
	}

	let pattern = null;
	const flags = caseSensitive ? "g" : "gi";
	const rawSource = String(query || "");
	if (useRegex) {
		try {
			const source = useWholeWord ? `\\b(?:${rawSource})\\b` : rawSource;
			pattern = new RegExp(source, flags);
		} catch {
			return [];
		}
	} else {
		const escapedSource = escapeRegExp(rawSource);
		const source = useWholeWord ? `\\b${escapedSource}\\b` : escapedSource;
		pattern = new RegExp(source, flags);
	}
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
const messageSearchPrevBtnEl = document.getElementById("messageSearchPrevBtn");
const messageSearchNextBtnEl = document.getElementById("messageSearchNextBtn");
const messageSearchMatchInfoEl = document.getElementById("messageSearchMatchInfo");
const closeMessageSearchBtnEl = document.getElementById("closeMessageSearchBtn");
const dialogHeaderSearchBtnEl = document.getElementById("dialogHeaderSearchBtn");
const messageSearchCaseBtnEl = document.getElementById("messageSearchCaseBtn");
const messageSearchRegexBtnEl = document.getElementById("messageSearchRegexBtn");
const messageSearchWholeWordBtnEl = document.getElementById("messageSearchWholeWordBtn");

let searchMatches = [];
let currentMatchIdx = -1;
let lastSearchQuery = "";
let isSearchCaseSensitive = false;
let isSearchRegex = false;
let isSearchWholeWord = false;
let lastSearchCaseSensitive = false;
let lastSearchRegex = false;
let lastSearchWholeWord = false;

function updateSearchOptionButtons() {
	if (messageSearchCaseBtnEl) {
		messageSearchCaseBtnEl.setAttribute("aria-pressed", isSearchCaseSensitive ? "true" : "false");
		// messageSearchCaseBtnEl.title = isSearchCaseSensitive ? "Case-sensitive On" : "Case-sensitive Off";
	}

	if (messageSearchRegexBtnEl) {
		messageSearchRegexBtnEl.setAttribute("aria-pressed", isSearchRegex ? "true" : "false");
		// messageSearchRegexBtnEl.title = isSearchRegex ? "Regex On" : "Regex Off";
	}

	if (messageSearchWholeWordBtnEl) {
		messageSearchWholeWordBtnEl.setAttribute("aria-pressed", isSearchWholeWord ? "true" : "false");
		// messageSearchWholeWordBtnEl.title = isSearchWholeWord ? "Whole-word On" : "Whole-word Off";
	}
}

function toggleSearchCaseSensitive() {
	isSearchCaseSensitive = !isSearchCaseSensitive;
	updateSearchOptionButtons();
	refreshMessageSearch({ scrollToActive: true, resetIndex: true });
	if (messageSearchInputEl) {
		messageSearchInputEl.focus();
	}
}

function toggleSearchRegex() {
	isSearchRegex = !isSearchRegex;
	updateSearchOptionButtons();
	refreshMessageSearch({ scrollToActive: true, resetIndex: true });
	if (messageSearchInputEl) {
		messageSearchInputEl.focus();
	}
}

function toggleSearchWholeWord() {
	isSearchWholeWord = !isSearchWholeWord;
	updateSearchOptionButtons();
	refreshMessageSearch({ scrollToActive: true, resetIndex: true });
	if (messageSearchInputEl) {
		messageSearchInputEl.focus();
	}
}

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
		lastSearchQuery = "";
		lastSearchCaseSensitive = isSearchCaseSensitive;
		lastSearchRegex = isSearchRegex;
		lastSearchWholeWord = isSearchWholeWord;
		updateSearchMatchInfo();
		updateSearchNavigationState();
		return;
	}

	const previousIndex = resetIndex ? 0 : currentMatchIdx;
	searchMatches = highlightMessageMatches(query, {
		caseSensitive: isSearchCaseSensitive,
		useRegex: isSearchRegex,
		useWholeWord: isSearchWholeWord
	});
	if (!searchMatches.length) {
		currentMatchIdx = -1;
		lastSearchQuery = query;
		lastSearchCaseSensitive = isSearchCaseSensitive;
		lastSearchRegex = isSearchRegex;
		lastSearchWholeWord = isSearchWholeWord;
		updateSearchMatchInfo();
		updateSearchNavigationState();
		return;
	}

	const nextIndex = previousIndex >= 0 ? Math.min(previousIndex, searchMatches.length - 1) : 0;
	lastSearchQuery = query;
	lastSearchCaseSensitive = isSearchCaseSensitive;
	lastSearchRegex = isSearchRegex;
	lastSearchWholeWord = isSearchWholeWord;
	setCurrentSearchMatch(nextIndex, { scroll: scrollToActive });
}


function openMessageSearchBar() {
	if (!messageSearchBarEl || !dialogHeaderSearchBtnEl) {
		return;
	}

	dialogHeaderSearchBtnEl.hidden = true;
	messageSearchBarEl.hidden = false;
	updateSearchOptionButtons();
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
	lastSearchQuery = "";
	lastSearchCaseSensitive = isSearchCaseSensitive;
	lastSearchRegex = isSearchRegex;
	lastSearchWholeWord = isSearchWholeWord;
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

function navigateSearchMatchesByWheel(direction) {
	if (!messageSearchBarEl || messageSearchBarEl.hidden || !searchMatches.length) {
		return false;
	}

	if (direction < 0) {
		gotoPrevMatch();
		return true;
	}

	if (direction > 0) {
		gotoNextMatch();
		return true;
	}

	return false;
}

function handleMessageSearchWheel(event) {
	const direction = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0;
	if (!direction) {
		return;
	}

	const handled = navigateSearchMatchesByWheel(direction);
	if (handled) {
		event.preventDefault();
	}
}

if (dialogHeaderSearchBtnEl) {
	dialogHeaderSearchBtnEl.addEventListener("click", openMessageSearchBar);
}
if (closeMessageSearchBtnEl) {
	closeMessageSearchBtnEl.addEventListener("click", closeMessageSearchBar);
}
if (messageSearchInputEl) {
	messageSearchInputEl.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			const query = messageSearchInputEl.value.trim();
			const canNavigateExistingResults =
				Boolean(query) &&
				query === lastSearchQuery &&
				isSearchCaseSensitive === lastSearchCaseSensitive &&
				isSearchRegex === lastSearchRegex &&
				isSearchWholeWord === lastSearchWholeWord &&
				searchMatches.length > 0 &&
				currentMatchIdx >= 0;

			if (canNavigateExistingResults) {
				gotoNextMatch();
			} else {
				runMessageSearch();
			}
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
if (messageSearchCaseBtnEl) {
	messageSearchCaseBtnEl.addEventListener("click", toggleSearchCaseSensitive);
}
if (messageSearchRegexBtnEl) {
	messageSearchRegexBtnEl.addEventListener("click", toggleSearchRegex);
}
if (messageSearchWholeWordBtnEl) {
	messageSearchWholeWordBtnEl.addEventListener("click", toggleSearchWholeWord);
}
if (messageSearchBarEl) {
	messageSearchBarEl.addEventListener("wheel", handleMessageSearchWheel, { passive: false });
}

updateSearchOptionButtons();
updateSearchMatchInfo();
updateSearchNavigationState();
// ====== Storage keys ======
const STORAGE_KEY = "llm-dialog-sessions-v1";
const ACTIVE_KEY = "llm-dialog-active-session";
const SIDEBAR_KEY = "llm-dialog-sidebar-collapsed-v1";
const CUSTOM_ORDER_KEY = "llm-dialog-session-custom-order-v1";

// ====== Seed data for first launch ======
const DEFAULT_SESSIONS = [
	{
		id: "s1",
		name: "Project Planning",
		isOpen: true,
		messages: [
			{ id: "m1", role: "user", text: "Help me break down this project into milestones.", timestamp: Date.now() - 1000 * 60 * 28 },
			{ id: "m2", role: "agent", text: "Sure. We can split it into discovery, implementation, and validation phases.", timestamp: Date.now() - 1000 * 60 * 27 }
		]
	},
	{
		id: "s2",
		name: "Prompt Experiments",
		isOpen: true,
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
let dialogHeaderCopyFeedbackTimeoutId = null;
let sessionSummaryCopyFeedbackTimeoutId = null;
let summaryNoticeTimeoutId = null;
let dialogHeaderSummarizeBusy = false;
let isSessionSummaryPageOpen = false;
let detachedSessionSummaryWindow = null;
let promptHistorySessionId = null;
let promptHistoryIndex = -1;
let promptHistoryDraft = "";
let isSidebarCollapsed = false;
let hasCustomSessionOrder = false;
let draggingSessionId = null;
let dragDropSessionId = null;
let dragDropInsertAfter = false;
let suppressSessionClickUntil = 0;

// ====== DOM references ======
const appEl = document.getElementById("app");
const newSessionBtnEl = document.getElementById("newSessionBtn");
const sessionListEl = document.getElementById("sessionList");
const dialogTitleEl = document.getElementById("dialogTitle");
const dialogTitleSummaryBtnEl = document.getElementById("dialogTitleSummaryBtn");
const messageSelectionStatusEl = document.getElementById("messageSelectionStatus");
const messagesEl = document.getElementById("messages");
const sessionSummaryPageEl = document.getElementById("sessionSummaryPage");
const sessionSummaryContentEl = document.getElementById("sessionSummaryContent");
const sessionSummaryCopyBtnEl = document.getElementById("sessionSummaryCopyBtn");
const sessionSummaryShareBtnEl = document.getElementById("sessionSummaryShareBtn");
const sessionSummaryClearBtnEl = document.getElementById("sessionSummaryClearBtn");
const sessionSummaryDetachBtnEl = document.getElementById("sessionSummaryDetachBtn");
const promptInputEl = document.getElementById("promptInput");
const modelSelectEl = document.getElementById("modelSelect");
const importSessionBtnEl = document.getElementById("importSessionBtn");
const exportAllSessionBtnEl = document.getElementById("exportAllSessionBtn");
const shareAllSessionRawBtnEl = document.getElementById("shareAllSessionRawBtn");
const clearSessionHistoryBtnEl = document.getElementById("clearSessionHistoryBtn");
const resetContextBtnEl = document.getElementById("resetContextBtn");
const dialogHeaderCopyBtnEl = document.getElementById("dialogHeaderCopyBtn");
const dialogHeaderShareBtnEl = document.getElementById("dialogHeaderShareBtn");
const dialogHeaderSummarizeBtnEl = document.getElementById("dialogHeaderSummarizeBtn");
const dialogHeaderExportMenuItemEl = document.getElementById("dialogHeaderExportMenuItem");
const dialogHeaderMenuBtnEl = document.getElementById("dialogHeaderMenuBtn");
const dialogHeaderMenuEl = document.getElementById("dialogHeaderMenu");
const copilotShareMenuBtnEl = document.getElementById("copilotShareMenuBtn");
const copilotShareMenuEl = document.getElementById("copilotShareMenu");
const sendBtnEl = document.getElementById("sendBtn");
const inputHintMenuEl = document.getElementById("inputHintMenu");
const mobileBackBtnEl = document.getElementById("mobileBackBtn");
const sidebarToggleBtnEl = document.getElementById("sidebarToggleBtn");
const sidebarEl = document.querySelector(".sidebar");
const defaultPromptPlaceholder = promptInputEl?.getAttribute("placeholder") || "Type your request to Copilot...";

let sessionHoverPopupEl = null;
let messageContextMenuEl = null;
let activeMessageContextId = null;
let isMessageMultiSelectMode = false;
const selectedMessageKeys = new Set();

const MESSAGE_CONTEXT_MENU_ITEMS = [
	{ action: "copy", label: "Copy", glyph: "⧉" },
	{ action: "reference", label: "Reference", glyph: "⌁" },
	{ action: "share", label: "Share", glyph: "⤴" },
	{ action: "favorites", label: "Favorites", glyph: "☆" },
	{ action: "select-multiple", label: "Select Multiple", glyph: "✓" },
	{ action: "delete", label: "Delete", glyph: "×", danger: true }
];

function normalizeMessageState(message) {
	if (!message || typeof message !== "object") {
		return;
	}

	if (typeof message.isFavorite !== "boolean") {
		message.isFavorite = false;
	}
}

function getMessageContextMenuItemConfig(action) {
	return MESSAGE_CONTEXT_MENU_ITEMS.find((item) => item.action === action) || null;
}

function setMessageContextMenuItemPresentation(action, { label, glyph, disabled = false } = {}) {
	if (!messageContextMenuEl) {
		return;
	}

	const itemEl = messageContextMenuEl.querySelector(`.message-context-menu-item[data-action="${action}"]`);
	if (!(itemEl instanceof HTMLButtonElement)) {
		return;
	}

	const config = getMessageContextMenuItemConfig(action);
	const glyphEl = itemEl.querySelector(".message-context-menu-glyph");
	const labelEl = itemEl.querySelector(".copilot-share-menu-item-text");
	if (glyphEl) {
		glyphEl.textContent = glyph || config?.glyph || "";
	}
	if (labelEl) {
		labelEl.textContent = label || config?.label || "";
	}
	itemEl.disabled = Boolean(disabled);
	itemEl.setAttribute("aria-disabled", itemEl.disabled ? "true" : "false");
}

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

function ensureMessageContextMenu() {
	if (messageContextMenuEl) {
		return messageContextMenuEl;
	}

	const popup = document.createElement("div");
	popup.className = "copilot-share-menu-popup message-context-menu";
	popup.hidden = true;
	popup.setAttribute("role", "menu");
	popup.setAttribute("aria-label", "Message actions");
	popup.innerHTML = MESSAGE_CONTEXT_MENU_ITEMS.map((item) => {
		if (item.type === "separator") {
			return '<div class="copilot-share-menu-separator message-context-menu-separator" role="separator"></div>';
		}

		return `
			<button
				class="copilot-share-menu-item message-context-menu-item${item.danger ? " delete" : ""}"
				type="button"
				data-action="${item.action}"
				role="menuitem"
			>
				<span class="copilot-share-menu-item-icon message-context-menu-glyph session-menu-glyph" aria-hidden="true">${escapeHtml(item.glyph || "")}</span>
				<span class="copilot-share-menu-item-text">${escapeHtml(item.label)}</span>
			</button>
		`;
	}).join("");
	document.body.appendChild(popup);
	messageContextMenuEl = popup;
	return popup;
}

function clearActiveMessageContextRow() {
	if (!activeMessageContextId || !messagesEl) {
		return;
	}

	const activeRow = messagesEl.querySelector(`.message-row[data-message-id="${activeMessageContextId}"]`);
	if (activeRow instanceof HTMLElement) {
		activeRow.classList.remove("is-context-menu-open");
	}
}

function hideMessageContextMenu() {
	clearActiveMessageContextRow();
	activeMessageContextId = null;

	if (!messageContextMenuEl) {
		return;
	}

	messageContextMenuEl.hidden = true;
	messageContextMenuEl.style.left = "";
	messageContextMenuEl.style.top = "";
	delete messageContextMenuEl.dataset.messageId;
	delete messageContextMenuEl.dataset.sessionId;
	delete messageContextMenuEl.dataset.role;
}

function showMessageContextMenu(rowEl, clientX, clientY) {
	if (!(rowEl instanceof HTMLElement)) {
		return;
	}

	hideMessageContextMenu();
	const popup = ensureMessageContextMenu();
	activeMessageContextId = String(rowEl.dataset.messageId || "").trim() || null;
	if (activeMessageContextId) {
		rowEl.classList.add("is-context-menu-open");
		popup.dataset.messageId = activeMessageContextId;
	}

	popup.dataset.sessionId = String(rowEl.dataset.sessionId || "").trim();
	popup.dataset.role = String(rowEl.dataset.role || "").trim();
	updateMessageContextMenuState(popup.dataset.sessionId, activeMessageContextId || "");
	popup.style.left = `${Math.round(clientX)}px`;
	popup.style.top = `${Math.round(clientY)}px`;
	popup.hidden = false;
	requestMenuPopupClamp();
}

function getMessageSelectionKey(sessionId, messageId) {
	return `${String(sessionId || "").trim()}::${String(messageId || "").trim()}`;
}

function isMessageSelected(sessionId, messageId) {
	return selectedMessageKeys.has(getMessageSelectionKey(sessionId, messageId));
}

function clearMessageSelections({ keepMode = false } = {}) {
	selectedMessageKeys.clear();
	if (!keepMode) {
		isMessageMultiSelectMode = false;
	}
}

function setMessageMultiSelectMode(enabled, sessionId, messageId) {
	if (!enabled) {
		clearMessageSelections();
		return;
	}

	isMessageMultiSelectMode = true;
	selectedMessageKeys.clear();
	if (sessionId && messageId) {
		selectedMessageKeys.add(getMessageSelectionKey(sessionId, messageId));
	}
}

function syncMessageSelectionForActiveSession(activeSession) {
	if (!activeSession) {
		clearMessageSelections();
		return;
	}

	const validKeys = new Set(
		activeSession.messages.map((message) => getMessageSelectionKey(activeSession.id, message.id))
	);

	for (const key of Array.from(selectedMessageKeys)) {
		if (!validKeys.has(key)) {
			selectedMessageKeys.delete(key);
		}
	}

	if (!selectedMessageKeys.size) {
		isMessageMultiSelectMode = false;
	}
}

function getMessageRecordsForContextAction(sessionId, messageId) {
	const session = sessions.find((item) => item.id === sessionId);
	if (!session) {
		return [];
	}

	const focusKey = getMessageSelectionKey(sessionId, messageId);
	if (isMessageMultiSelectMode && selectedMessageKeys.has(focusKey)) {
		return session.messages.filter((message) => selectedMessageKeys.has(getMessageSelectionKey(sessionId, message.id)));
	}

	const single = session.messages.find((message) => message.id === messageId);
	return single ? [single] : [];
}

function updateMessageContextMenuState(sessionId, messageId) {
	ensureMessageContextMenu();
	const records = getMessageRecordsForContextAction(sessionId, messageId);
	const count = records.length;
	const isBatch = count > 1;
	const countSuffix = isBatch ? ` (${count})` : "";
	const allFavorited = count > 0 && records.every((message) => message.isFavorite === true);
	const isLocked = isSessionLocked(sessionId);

	setMessageContextMenuItemPresentation("copy", {
		label: isBatch ? `Copy Selected${countSuffix}` : "Copy",
		disabled: count < 1
	});
	setMessageContextMenuItemPresentation("export", {
		label: isBatch ? `Export Selected${countSuffix}` : "Export",
		disabled: count < 1
	});
	setMessageContextMenuItemPresentation("favorites", {
		label: isBatch
			? (allFavorited ? `Remove Favorites${countSuffix}` : `Favorite Selected${countSuffix}`)
			: (allFavorited ? "Remove Favorite" : "Favorite"),
		glyph: allFavorited ? "★" : "☆",
		disabled: isLocked || count < 1
	});
	setMessageContextMenuItemPresentation("select-multiple", {
		label: isMessageMultiSelectMode ? "Cancel Selecting" : "Select Multiple"
	});
	setMessageContextMenuItemPresentation("delete", {
		label: isBatch ? `Delete Selected${countSuffix}` : "Delete",
		disabled: isLocked || count < 1
	});
}

function buildMessageRecordsMarkdown(messages) {
	if (!Array.isArray(messages) || !messages.length) {
		return "";
	}

	const lines = [];
	const prefixArray = [
		{ user: "💬", copilot: "✨"}, // 0
		{ user: "🧑‍💻", copilot: "🤖"},
		{ user: "👩‍🚀", copilot: "🛸"},
		{ user: "🦸", copilot: "🦾"},
		{ user: "🗣️", copilot: "💡"},
		{ user: "🙋", copilot: "✨"}, // 5
		{ user: "👨‍🎨", copilot: "🎨"},
		{ user: "🧑‍🔬", copilot: "🧬"},
		{ user: "🧑‍🏫", copilot: "📚"},
		{ user: "👤", copilot: "🤖"},
		{ user: "😃", copilot: "🚀"}, // 10
	];
	const prefix = prefixArray[10];
	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index];
		const roleLabel = message.role === "agent" ? (prefix.copilot + " " + "Copilot") : (prefix.user + " " + "User");
		const timestamp = Number.isFinite(message.timestamp) ? formatDateTime(message.timestamp) : "Unknown time";
		lines.push(`**${roleLabel} (${timestamp})**`);
		lines.push("");

		if (message.role === "agent") {
			const content = String(message.text || "").replace(/\r\n/g, "\n").trim();
			lines.push(content || "_(empty Copilot message)_");
		} else {
			const content = String(message.text || "").replace(/\r\n/g, "\n").trim();
			lines.push(content || "_(empty User message)_");
		}

		if (index < messages.length - 1) {
			lines.push("");
			lines.push("---");
			lines.push("");
		}
	}

	return lines.join("\n").trim();
}

async function copyTextToClipboard(text) {
	const value = String(text || "");
	if (!value) {
		return;
	}

	if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
		await navigator.clipboard.writeText(value);
		return;
	}

	const textarea = document.createElement("textarea");
	textarea.value = value;
	textarea.setAttribute("readonly", "true");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	textarea.style.pointerEvents = "none";
	document.body.appendChild(textarea);
	textarea.select();
	document.execCommand("copy");
	textarea.remove();
}

async function copyMessageRecords(messages) {
	const markdown = buildMessageRecordsMarkdown(messages);
	if (!markdown) {
		return;
	}

	await copyTextToClipboard(markdown);
}

function showDialogHeaderCopyFeedback() {
	if (!dialogHeaderCopyBtnEl) {
		return;
	}

	dialogHeaderCopyBtnEl.classList.remove("is-copied");
	void dialogHeaderCopyBtnEl.offsetWidth;
	dialogHeaderCopyBtnEl.classList.add("is-copied");

	if (dialogHeaderCopyFeedbackTimeoutId) {
		window.clearTimeout(dialogHeaderCopyFeedbackTimeoutId);
	}

	dialogHeaderCopyFeedbackTimeoutId = window.setTimeout(() => {
		dialogHeaderCopyBtnEl?.classList.remove("is-copied");
		dialogHeaderCopyFeedbackTimeoutId = null;
	}, 1200);
}

function showSessionSummaryCopyFeedback() {
	if (!sessionSummaryCopyBtnEl) {
		return;
	}

	sessionSummaryCopyBtnEl.classList.remove("is-copied");
	void sessionSummaryCopyBtnEl.offsetWidth;
	sessionSummaryCopyBtnEl.classList.add("is-copied");

	if (sessionSummaryCopyFeedbackTimeoutId) {
		window.clearTimeout(sessionSummaryCopyFeedbackTimeoutId);
	}

	sessionSummaryCopyFeedbackTimeoutId = window.setTimeout(() => {
		sessionSummaryCopyBtnEl?.classList.remove("is-copied");
		sessionSummaryCopyFeedbackTimeoutId = null;
	}, 1200);
}

function showSummaryNoticeFeedback() {
	if (!dialogTitleSummaryBtnEl) {
		return;
	}

	dialogTitleSummaryBtnEl.classList.remove("has-new-summary");
	void dialogTitleSummaryBtnEl.offsetWidth;
	dialogTitleSummaryBtnEl.classList.add("has-new-summary");

	if (summaryNoticeTimeoutId) {
		window.clearTimeout(summaryNoticeTimeoutId);
	}

	summaryNoticeTimeoutId = window.setTimeout(() => {
		dialogTitleSummaryBtnEl?.classList.remove("has-new-summary");
		summaryNoticeTimeoutId = null;
	}, 2600);
}

function exportMessageRecords(sessionId, messages) {
	const markdown = buildMessageRecordsMarkdown(messages);
	if (!markdown) {
		return;
	}

	const session = sessions.find((item) => item.id === sessionId);
	const sessionName = session ? session.name : "messages";
	const safeName = sanitizeFileName(sessionName);
	const stamp = formatDateTimeForFileName(Date.now());
	const scope = messages.length > 1 ? `${messages.length}-messages` : "message";
	const fileName = `${safeName}-${scope}-${stamp}.md`;
	const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
	downloadBlob(blob, fileName);
}

function buildSessionSummaryMarkdown(summaryText, { sessionName = "Session", sessionId = "" } = {}) {
	const generatedAt = Date.now();
	const cleanedSummary = String(summaryText || "").replace(/\r\n/g, "\n").trim();
	if (!cleanedSummary) {
		return "";
	}

	const lines = [
		"## Session Summary",
		"",
		`- Session Name: ${String(sessionName || "Session")}`,
		`- Session ID: ${String(sessionId || "") || "unknown"}`,
		`- Generated At: ${formatDateTime(generatedAt)}`,
		"",
		cleanedSummary
	];

	return lines.join("\n").trim();
}

function downloadSessionSummary(session, summaryText) {
	if (!session) {
		return;
	}

	const markdown = buildSessionSummaryMarkdown(summaryText, {
		sessionName: session.name,
		sessionId: session.id
	});
	if (!markdown) {
		return;
	}

	const safeName = sanitizeFileName(session.name || "session");
	const stamp = formatDateTimeForFileName(Date.now());
	const fileName = `${safeName}-summary-${stamp}.md`;
	const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
	downloadBlob(blob, fileName);
}

function exportSessionSummaryMarkdown(session, markdown) {
	if (!session) {
		return;
	}

	const normalizedMarkdown = String(markdown || "").trim();
	if (!normalizedMarkdown) {
		return;
	}

	const safeName = sanitizeFileName(session.name || "session");
	const stamp = formatDateTimeForFileName(Date.now());
	const fileName = `${safeName}-summary-${stamp}.md`;
	const blob = new Blob([normalizedMarkdown], { type: "text/markdown;charset=utf-8" });
	downloadBlob(blob, fileName);
}

function getSessionSummaryMarkdown(session) {
	if (!session || typeof session !== "object") {
		return "";
	}

	return String(session.summaryMarkdown || "").trim();
}

function getDetachedSummaryWindow() {
	if (!detachedSessionSummaryWindow) {
		return null;
	}

	try {
		if (detachedSessionSummaryWindow.closed) {
			detachedSessionSummaryWindow = null;
			return null;
		}
	} catch {
		detachedSessionSummaryWindow = null;
		return null;
	}

	return detachedSessionSummaryWindow;
}

function clearDetachedSummaryWindowReference() {
	detachedSessionSummaryWindow = null;
	updateInputActionStates();
}

function buildDetachedSummarySnapshot() {
	const active = getActiveSession();
	const sessionName = active?.name ? String(active.name) : "Session";
	const contentHtml = sessionSummaryContentEl
		? sessionSummaryContentEl.innerHTML
		: '<div class="session-summary-empty">No summary available for this session yet.</div>';

	return {
		sessionName,
		contentHtml
	};
}

window.getDetachedSummarySnapshot = function getDetachedSummarySnapshot() {
	return buildDetachedSummarySnapshot();
};

function syncDetachedSummaryWindowContent() {
	const detachedWindow = getDetachedSummaryWindow();
	if (!detachedWindow) {
		return;
	}

	const snapshot = buildDetachedSummarySnapshot();

	try {
		if (typeof detachedWindow.syncSummaryContent === "function") {
			detachedWindow.syncSummaryContent(snapshot);
			return;
		}

		detachedWindow.addEventListener("load", () => {
			try {
				if (typeof detachedWindow.syncSummaryContent === "function") {
					detachedWindow.syncSummaryContent(snapshot);
				}
			} catch {
				clearDetachedSummaryWindowReference();
			}
		}, { once: true });
	} catch {
		clearDetachedSummaryWindowReference();
	}
}

function openDetachedSessionSummaryWindow() {
	const active = getActiveSession();
	const markdown = active ? getSessionSummaryMarkdown(active) : "";
	if (!active || !markdown) {
		return;
	}

	renderSessionSummaryPage();

	let detachedWindow = getDetachedSummaryWindow();
	if (!detachedWindow) {
		const width = 560;
		const height = 520;
		const left = Math.max(0, Math.round(window.screenX + Math.max(24, (window.outerWidth - width) / 2)));
		const top = Math.max(0, Math.round(window.screenY + Math.max(24, (window.outerHeight - height) / 2)));
		const summaryMiniUrl = new URL("./summary-mini.html", window.location.href).href;
		detachedWindow = window.open(
			summaryMiniUrl,
			"copilotShareSessionSummaryMini",
			`popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,location=no,toolbar=no,menubar=no,status=no`
		);
		if (!detachedWindow) {
			window.alert("Unable to open the summary mini window. Please allow popups for this page.");
			return;
		}

		detachedSessionSummaryWindow = detachedWindow;
		detachedWindow.addEventListener("beforeunload", clearDetachedSummaryWindowReference, { once: true });
	}

	syncDetachedSummaryWindowContent();
	closeSessionSummaryPage();
	try {
		detachedWindow.focus();
	} catch {
		// Ignore focus failures from restricted hosts.
	}
}

function setSummaryPageOpen(open) {
	isSessionSummaryPageOpen = Boolean(open);
	if (appEl) {
		appEl.classList.toggle("show-summary-page", isSessionSummaryPageOpen);
	}
	if (sessionSummaryPageEl) {
		sessionSummaryPageEl.hidden = !isSessionSummaryPageOpen;
	}
	if (sessionSummaryCopyBtnEl) {
		sessionSummaryCopyBtnEl.hidden = !isSessionSummaryPageOpen;
	}
	if (sessionSummaryShareBtnEl) {
		sessionSummaryShareBtnEl.hidden = !isSessionSummaryPageOpen;
	}
	if (sessionSummaryClearBtnEl) {
		sessionSummaryClearBtnEl.hidden = !isSessionSummaryPageOpen;
	}
	if (sessionSummaryDetachBtnEl) {
		sessionSummaryDetachBtnEl.hidden = !isSessionSummaryPageOpen;
	}
	updateInputActionStates();
}

function renderSessionSummaryPage() {
	if (!sessionSummaryPageEl || !sessionSummaryContentEl) {
		return;
	}

	const active = getActiveSession();
	if (!active) {
		const detachedWindow = getDetachedSummaryWindow();
		if (detachedWindow) {
			try {
				detachedWindow.close();
			} catch {
				clearDetachedSummaryWindowReference();
			}
		}
		setSummaryPageOpen(false);
		return;
	}

	const markdown = getSessionSummaryMarkdown(active);
	if (!markdown) {
		sessionSummaryContentEl.innerHTML = `<div class="session-summary-empty">No summary available for this session yet.</div>`;
		if (sessionSummaryCopyBtnEl) {
			sessionSummaryCopyBtnEl.disabled = true;
		}
		if (sessionSummaryShareBtnEl) {
			sessionSummaryShareBtnEl.disabled = true;
		}
		if (sessionSummaryClearBtnEl) {
			sessionSummaryClearBtnEl.disabled = true;
		}
		if (sessionSummaryDetachBtnEl) {
			sessionSummaryDetachBtnEl.disabled = true;
		}
		syncDetachedSummaryWindowContent();
		return;
	}

	const markdownRenderer = typeof window.renderAgentMarkdown === "function" ? window.renderAgentMarkdown : escapeHtml;
	sessionSummaryContentEl.innerHTML = `<article class="session-summary-markdown markdown-body">${markdownRenderer(markdown)}</article>`;
	if (typeof window.enhanceMarkdownContent === "function") {
		window.enhanceMarkdownContent(sessionSummaryContentEl);
	}
	if (typeof window.applyMarkdownCodeHighlight === "function") {
		window.applyMarkdownCodeHighlight(sessionSummaryContentEl);
	}
	if (sessionSummaryCopyBtnEl) {
		sessionSummaryCopyBtnEl.disabled = false;
	}
	if (sessionSummaryShareBtnEl) {
		sessionSummaryShareBtnEl.disabled = false;
	}
	if (sessionSummaryClearBtnEl) {
		sessionSummaryClearBtnEl.disabled = false;
	}
	if (sessionSummaryDetachBtnEl) {
		sessionSummaryDetachBtnEl.disabled = false;
	}
	syncDetachedSummaryWindowContent();
}

function openSessionSummaryPage() {
	const active = getActiveSession();
	if (!active) {
		return;
	}

	renderSessionSummaryPage();
	setSummaryPageOpen(true);
}

function closeSessionSummaryPage() {
	setSummaryPageOpen(false);
}

function toggleFavoriteForMessageRecords(sessionId, messages) {
	if (isSessionLocked(sessionId) || !Array.isArray(messages) || !messages.length) {
		return false;
	}

	const session = sessions.find((item) => item.id === sessionId);
	if (!session) {
		return false;
	}

	const targetIds = new Set(messages.map((message) => message.id));
	const shouldFavorite = messages.some((message) => message.isFavorite !== true);
	let didChange = false;

	for (const message of session.messages) {
		if (!targetIds.has(message.id)) {
			continue;
		}

		normalizeMessageState(message);
		if (message.isFavorite !== shouldFavorite) {
			message.isFavorite = shouldFavorite;
			didChange = true;
		}
	}

	if (!didChange) {
		return true;
	}

	renderMessages({ preserveScroll: true });
	saveState();
	return true;
}

function deleteMessageRecords(sessionId, messages) {
	if (isSessionLocked(sessionId) || !Array.isArray(messages) || !messages.length) {
		return false;
	}

	const session = sessions.find((item) => item.id === sessionId);
	if (!session) {
		return false;
	}

	const targetIds = new Set(messages.map((message) => message.id));
	const count = targetIds.size;
	const promptText = count > 1
		? `Delete ${count} selected messages?`
		: "Delete this message?";
	if (!window.confirm(promptText)) {
		return false;
	}

	session.messages = session.messages.filter((message) => !targetIds.has(message.id));
	clearMessageSelections();
	renderAll();
	saveState();
	return true;
}

function getMenuPopupBoundaryRect() {
	if (appEl && typeof appEl.getBoundingClientRect === "function") {
		const rect = appEl.getBoundingClientRect();
		return {
			left: rect.left + 6,
			right: rect.right - 6,
			top: rect.top + 6,
			bottom: rect.bottom - 6
		};
	}

	return {
		left: 6,
		right: window.innerWidth - 6,
		top: 6,
		bottom: window.innerHeight - 6
	};
}

function clampMenuPopupToBoundary(popupEl) {
	if (!(popupEl instanceof HTMLElement) || popupEl.hidden) {
		return;
	}

	popupEl.style.transform = "";
	popupEl.style.maxHeight = "";
	popupEl.style.overflowY = "";
	const boundary = getMenuPopupBoundaryRect();
	const availableHeight = Math.max(80, Math.floor(boundary.bottom - boundary.top));
	let rect = popupEl.getBoundingClientRect();

	if (rect.height > availableHeight + 0.5) {
		popupEl.style.maxHeight = `${availableHeight}px`;
		popupEl.style.overflowY = "auto";
		rect = popupEl.getBoundingClientRect();
	}

	let deltaX = 0;
	let deltaY = 0;

	if (rect.right > boundary.right) {
		deltaX -= rect.right - boundary.right;
	}
	if (rect.left + deltaX < boundary.left) {
		deltaX += boundary.left - (rect.left + deltaX);
	}

	if (rect.bottom > boundary.bottom) {
		deltaY -= rect.bottom - boundary.bottom;
	}
	if (rect.top + deltaY < boundary.top) {
		deltaY += boundary.top - (rect.top + deltaY);
	}

	if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
		popupEl.style.transform = `translate(${Math.round(deltaX)}px, ${Math.round(deltaY)}px)`;
	}
}

function clampVisibleMenuPopups() {
	const popups = document.querySelectorAll(".copilot-share-menu-popup");
	popups.forEach((popupEl) => {
		clampMenuPopupToBoundary(popupEl);
	});
}

function requestMenuPopupClamp() {
	window.requestAnimationFrame(() => {
		clampVisibleMenuPopups();
	});
}

window.requestMenuPopupClamp = requestMenuPopupClamp;

function closeAllSessionActionMenus() {
	const popups = document.querySelectorAll(".session-more-menu-popup");
	popups.forEach((popupEl) => {
		popupEl.hidden = true;
	});

	const triggers = document.querySelectorAll(".session-actions .copilot-share-menu-trigger");
	triggers.forEach((triggerEl) => {
		if (triggerEl instanceof HTMLElement) {
			triggerEl.setAttribute("aria-expanded", "false");
		}
	});
}

function toggleSessionActionMenu(triggerEl) {
	if (!(triggerEl instanceof HTMLElement)) {
		return;
	}

	const menuBox = triggerEl.closest(".copilot-share-menu");
	if (!(menuBox instanceof HTMLElement)) {
		return;
	}

	const popupEl = menuBox.querySelector(".session-more-menu-popup");
	if (!(popupEl instanceof HTMLElement)) {
		return;
	}

	const expanded = triggerEl.getAttribute("aria-expanded") === "true";
	closeAllSessionActionMenus();

	if (!expanded) {
		popupEl.hidden = false;
		triggerEl.setAttribute("aria-expanded", "true");
		requestMenuPopupClamp();
	}
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

function formatDateTimeForFileName(timestamp) {
	const date = new Date(timestamp);
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	const ss = String(date.getSeconds()).padStart(2, "0");
	return `${y}${m}${d}-${hh}${mm}${ss}`;
}

function sanitizeFileName(value) {
	return String(value || "session")
		.replace(/[\\/:*?"<>|]+/g, "-")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 80) || "session";
}

function getMarkdownFence(content) {
	const matches = String(content || "").match(/`+/g);
	let maxTicks = 2;
	if (matches) {
		for (const token of matches) {
			if (token.length > maxTicks) {
				maxTicks = token.length;
			}
		}
	}
	return "`".repeat(Math.max(3, maxTicks + 1));
}

function asFencedMarkdownBlock(content) {
	const body = String(content || "").replace(/\r\n/g, "\n");
	const fence = getMarkdownFence(body);
	return `${fence}\n${body}\n${fence}`;
}

function resolveModelMetadata(session) {
	const modelId = String(session?.modelId || "").trim() || (modelSelectEl ? String(modelSelectEl.value || "").trim() : "");
	if (!modelId || !(modelSelectEl instanceof HTMLSelectElement)) {
		return {
			id: modelId,
			name: "Unknown"
		};
	}

	const option = Array.from(modelSelectEl.options).find((item) => item.value === modelId);
	return {
		id: modelId,
		name: option ? String(option.textContent || modelId).trim() : modelId
	};
}

function buildSessionMarkdown(session) {
	const model = resolveModelMetadata(session);
	const lines = [];
	lines.push(`# ${String(session.name || "Session")}`);
	lines.push("");
	lines.push("## Session Metadata");
	lines.push("");
	lines.push(`- Session Name: ${String(session.name || "")}`);
	lines.push(`- Session ID: ${String(session.id || "")}`);
	lines.push(`- Current Model: ${model.name}`);
	lines.push(`- Current Model ID: ${model.id || "Unknown"}`);
	lines.push(`- Exported At: ${formatDateTime(Date.now())}`);
	lines.push("");
	lines.push("## Conversation");

	if (!Array.isArray(session.messages) || !session.messages.length) {
		lines.push("");
		lines.push("_No messages in this session._");
		return lines.join("\n");
	}

	for (const message of session.messages) {
		const roleLabel = message.role === "agent" ? "Copilot" : "User";
		const timestamp = Number.isFinite(message.timestamp) ? formatDateTime(message.timestamp) : "Unknown time";
		lines.push("");
		lines.push(`### ${roleLabel} (${timestamp})`);
		lines.push("");
		lines.push(asFencedMarkdownBlock(String(message.text || "")));
	}

	return lines.join("\n");
}

function downloadSessionAsMarkdown() {
	const active = getActiveSession();
	if (!active) {
		return;
	}

	const markdown = buildSessionMarkdown(active);
	const safeName = sanitizeFileName(active.name);
	const stamp = formatDateTimeForFileName(Date.now());
	const fileName = `${safeName}-${active.id}-${stamp}.md`;
	const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
	const blobUrl = URL.createObjectURL(blob);

	const anchor = document.createElement("a");
	anchor.href = blobUrl;
	anchor.download = fileName;
	anchor.rel = "noopener";
	document.body.append(anchor);
	anchor.click();
	anchor.remove();

	window.setTimeout(() => {
		URL.revokeObjectURL(blobUrl);
	}, 0);
}

function downloadBlob(blob, fileName) {
	const blobUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = blobUrl;
	anchor.download = fileName;
	anchor.rel = "noopener";
	document.body.append(anchor);
	anchor.click();
	anchor.remove();

	window.setTimeout(() => {
		URL.revokeObjectURL(blobUrl);
	}, 0);
}

function closeCopilotShareMenu() {
	if (copilotShareMenuEl instanceof HTMLElement) {
		copilotShareMenuEl.hidden = true;
	}
	if (copilotShareMenuBtnEl instanceof HTMLElement) {
		copilotShareMenuBtnEl.setAttribute("aria-expanded", "false");
	}
}

async function downloadAllSessionsAsZip() {
	if (!Array.isArray(sessions) || !sessions.length) {
		return;
	}

	const JSZipCtor = window.JSZip;
	if (typeof JSZipCtor !== "function") {
		window.alert("ZIP export is unavailable because the archive library did not load.");
		return;
	}

	const exportStamp = formatDateTimeForFileName(Date.now());
	const zip = new JSZipCtor();
	sessions.forEach((session, index) => {
		if (!session || !session.id) {
			return;
		}

		const markdown = buildSessionMarkdown(session);
		const safeName = sanitizeFileName(session.name);
		const fileName = `${safeName}-${session.id}-${exportStamp}-${String(index + 1).padStart(2, "0")}.md`;
		zip.file(fileName, markdown);
	});

	const zipBlob = await zip.generateAsync({
		type: "blob",
		compression: "DEFLATE",
		compressionOptions: { level: 6 }
	});
	const archiveName = `copilot-share-sessions-${exportStamp}.zip`;
	downloadBlob(zipBlob, archiveName);
}

async function downloadAllSessionsRawMessagesAsZip() {
	if (!Array.isArray(sessions) || !sessions.length) {
		return;
	}

	const JSZipCtor = window.JSZip;
	if (typeof JSZipCtor !== "function") {
		window.alert("ZIP export is unavailable because the archive library did not load.");
		return;
	}

	const exportStamp = formatDateTimeForFileName(Date.now());
	const zip = new JSZipCtor();
	let fileCount = 0;

	sessions.forEach((session) => {
		if (!session || !session.id || !Array.isArray(session.messages) || !session.messages.length) {
			return;
		}

		const markdown = buildMessageRecordsMarkdown(session.messages);
		if (!markdown) {
			return;
		}

		const safeName = sanitizeFileName(session.name);
		const scope = session.messages.length > 1 ? `${session.messages.length}-messages` : "message";
		const fileName = `${safeName}-${scope}-${exportStamp}.md`;
		zip.file(fileName, markdown);
		fileCount += 1;
	});

	if (!fileCount) {
		return;
	}

	const zipBlob = await zip.generateAsync({
		type: "blob",
		compression: "DEFLATE",
		compressionOptions: { level: 6 }
	});
	const archiveName = `copilot-share-raw-messages-${exportStamp}.zip`;
	downloadBlob(zipBlob, archiveName);
}

function parseSessionTimestamp(value) {
	const text = String(value || "").trim();
	const match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
	if (!match) {
		return Date.now();
	}

	const year = Number(match[1]);
	const month = Number(match[2]) - 1;
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const date = new Date(year, month, day, hour, minute, 0, 0);
	const timestamp = date.getTime();
	return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function parseSessionMetadataFromMarkdown(markdown) {
	const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
	const metadata = {
		sessionName: "",
		sessionId: "",
		currentModel: "",
		currentModelId: ""
	};

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line.startsWith("-")) {
			continue;
		}

		const pairMatch = line.match(/^-\s*([^:]+):\s*(.*)$/);
		if (!pairMatch) {
			continue;
		}

		const key = String(pairMatch[1] || "").trim().toLowerCase();
		const value = String(pairMatch[2] || "").trim();
		if (key === "session name") {
			metadata.sessionName = value;
		}
		if (key === "session id") {
			metadata.sessionId = value;
		}
		if (key === "current model") {
			metadata.currentModel = value;
		}
		if (key === "current model id") {
			metadata.currentModelId = value;
		}
	}

	return metadata;
}

function parseSessionMessagesFromMarkdown(markdown) {
	const normalized = String(markdown || "").replace(/\r\n/g, "\n");
	const lines = normalized.split("\n");
	const messages = [];

	let index = 0;
	while (index < lines.length) {
		const headingMatch = lines[index].match(/^###\s+(User|Copilot)\s*\(([^)]*)\)\s*$/);
		if (!headingMatch) {
			index += 1;
			continue;
		}

		const role = headingMatch[1] === "Copilot" ? "agent" : "user";
		const timestamp = parseSessionTimestamp(headingMatch[2]);
		index += 1;

		while (index < lines.length && !String(lines[index]).trim()) {
			index += 1;
		}

		if (index >= lines.length) {
			messages.push({
				id: `m_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
				role,
				text: "",
				timestamp,
				isFavorite: false
			});
			break;
		}

		const fenceStartMatch = lines[index].match(/^(`{3,})\s*$/);
		if (!fenceStartMatch) {
			index += 1;
			continue;
		}

		const fence = fenceStartMatch[1];
		index += 1;
		const contentLines = [];

		while (index < lines.length && lines[index] !== fence) {
			contentLines.push(lines[index]);
			index += 1;
		}

		if (index < lines.length && lines[index] === fence) {
			index += 1;
		}

		messages.push({
			id: `m_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
			role,
			text: contentLines.join("\n"),
			timestamp,
			isFavorite: false
		});
	}

	return messages;
}

function parseSessionFromMarkdown(markdown) {
	const metadata = parseSessionMetadataFromMarkdown(markdown);
	const missingFields = [];
	if (!metadata.sessionName) {
		missingFields.push("Session Name");
	}
	if (!metadata.sessionId) {
		missingFields.push("Session ID");
	}
	if (!metadata.currentModel) {
		missingFields.push("Current Model");
	}
	if (!metadata.currentModelId) {
		missingFields.push("Current Model ID");
	}

	if (missingFields.length) {
		throw new Error(`Missing metadata fields: ${missingFields.join(", ")}`);
	}

	const parsedMessages = parseSessionMessagesFromMarkdown(markdown);
	return {
		id: metadata.sessionId,
		name: metadata.sessionName,
		modelId: metadata.currentModelId,
		messages: parsedMessages
	};
}

function pickImportMarkdownFile() {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".md,text/markdown,text/plain";
		input.style.display = "none";

		const cleanup = () => {
			input.remove();
		};

		input.addEventListener("change", () => {
			const file = input.files && input.files[0] ? input.files[0] : null;
			cleanup();
			resolve(file);
		}, { once: true });

		document.body.append(input);
		input.click();
	});
}

async function importSessionFromMarkdown() {
	const selectedFile = await pickImportMarkdownFile();
	if (!selectedFile) {
		return;
	}

	const markdown = await selectedFile.text();
	let importedSession;
	try {
		importedSession = parseSessionFromMarkdown(markdown);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		window.alert(`Import failed: ${message}`);
		return;
	}

	const duplicated = sessions.find((item) => item.id === importedSession.id);
	if (duplicated) {
		window.alert(`Import Warning: A session with ID "${importedSession.id}" already exists. Import cancelled.`);
		return;
	}

	sessions.unshift(importedSession);
	activeSessionId = importedSession.id;
	resetPromptHistoryNavigation();
	renderAll();
	saveState();

	try {
		await loadCopilotModels();
	} catch {
		// Keep imported model ID even if model list refresh fails.
	}

	if (typeof window.setActiveSessionModelId === "function") {
		window.setActiveSessionModelId(importedSession.modelId);
	}
	if (typeof window.syncModelPickerForActiveSession === "function") {
		window.syncModelPickerForActiveSession();
	}

	if (window.matchMedia("(max-width: 760px)").matches) {
		appEl.classList.add("show-dialog");
	}
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
	localStorage.setItem(CUSTOM_ORDER_KEY, hasCustomSessionOrder ? "1" : "0");
	if (activeSessionId) {
		localStorage.setItem(ACTIVE_KEY, activeSessionId);
	}
}

function saveSidebarState() {
	localStorage.setItem(SIDEBAR_KEY, isSidebarCollapsed ? "1" : "0");
}

function normalizeSessionState(session) {
	if (!session || typeof session !== "object") {
		return;
	}

	if (!Array.isArray(session.messages)) {
		session.messages = [];
	}

	session.messages.forEach((message) => {
		normalizeMessageState(message);
	});

	if (typeof session.isOpen !== "boolean") {
		session.isOpen = true;
	}

	if (typeof session.summaryMarkdown !== "string") {
		session.summaryMarkdown = "";
	}
}

function isSessionLocked(sessionId) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return false;
	}

	normalizeSessionState(target);
	return target.isOpen === false;
}

function isActiveSessionLocked() {
	return Boolean(activeSessionId) && isSessionLocked(activeSessionId);
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

	sessions.forEach((session) => {
		normalizeSessionState(session);
	});

	const storedActive = localStorage.getItem(ACTIVE_KEY);
	const found = sessions.find((item) => item.id === storedActive);
	activeSessionId = found ? found.id : sessions[0]?.id || null;

	isSidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === "1";
	hasCustomSessionOrder = localStorage.getItem(CUSTOM_ORDER_KEY) === "1";
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

	requestMenuPopupClamp();
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
	if (hasCustomSessionOrder) {
		return;
	}

	sessions.sort((a, b) => {
		const aTime = a.messages[a.messages.length - 1]?.timestamp || 0;
		const bTime = b.messages[b.messages.length - 1]?.timestamp || 0;
		return bTime - aTime;
	});
}

function clearSessionDropMarkers() {
	const items = sessionListEl.querySelectorAll(".session-item");
	items.forEach((itemEl) => {
		itemEl.classList.remove("drop-before", "drop-after", "is-dragging");
	});
}

function moveSessionInList(sessionId, targetSessionId, insertAfter) {
	if (!sessionId || !targetSessionId || sessionId === targetSessionId) {
		return false;
	}

	const fromIndex = sessions.findIndex((item) => item.id === sessionId);
	const targetIndex = sessions.findIndex((item) => item.id === targetSessionId);
	if (fromIndex < 0 || targetIndex < 0) {
		return false;
	}

	const [moved] = sessions.splice(fromIndex, 1);
	let insertionIndex = targetIndex + (insertAfter ? 1 : 0);
	if (fromIndex < insertionIndex) {
		insertionIndex -= 1;
	}

	insertionIndex = Math.max(0, Math.min(insertionIndex, sessions.length));
	sessions.splice(insertionIndex, 0, moved);
	return true;
}

function createSession(name) {
	const title = (name || "").trim() || `New Session ${sessions.length + 1}`;
	const newSession = {
		id: `s_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
		name: title,
		isOpen: true,
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
	if (isSessionLocked(sessionId)) {
		return;
	}

	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return;
	}
	const next = window.prompt("Rename Session", target.name);
	if (next === null) {
		return;
	}
	const trimmed = next.trim();
	if (!trimmed) {
		return;
	}
	target.name = trimmed;
	renderAll({ preserveMessageScroll: true });
	saveState();
}

function toggleSessionOpenState(sessionId) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return;
	}

	normalizeSessionState(target);
	target.isOpen = !target.isOpen;
	renderAll({ preserveMessageScroll: true });
	saveState();
}

function deleteSession(sessionId) {
	if (isSessionLocked(sessionId)) {
		return;
	}

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
		timestamp: Date.now(),
		isFavorite: false
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
			const isOpen = session.isOpen !== false;
			const isLocked = !isOpen;
			const lockTitle = isOpen ? "Lock session" : "Unlock session";
			const lockGlyph = isOpen ? "🔓︎": "🔐︎";
			const moreTitle = "More Actions";
			const safeName = escapeHtml(session.name);
			const iconText = escapeHtml(session.name.slice(0, 1).toUpperCase() || "S");
			const previewText = getPreview(session).replace(/\s+/g, " ").trim();
			const safePreview = escapeHtml(previewText);
			const sessionMenuId = `sessionActionMenu_${session.id}`;

			return `
				<li class="session-item ${activeClass}" data-id="${session.id}" role="button" tabindex="0" aria-label="Open ${safeName}" draggable="true">
					<div class="session-icon">${iconText}</div>
					<div class="session-main">
						<div class="session-top">
							<span class="session-name">${safeName}</span>
							<span class="session-time">${latest ? formatTime(latest.timestamp) : ""}</span>
						</div>
						<div class="session-preview">${safePreview}</div>
					</div>
					<div class="session-actions">
						<div class="copilot-share-menu session-item-menu">
							<button class="action-btn lock" type="button" data-action="toggle-lock" data-id="${session.id}" aria-label="${lockTitle}" title="${lockTitle}">
								<span class="session-menu-glyph" aria-hidden="true">${lockGlyph}</span>
							</button>
							<button class="action-btn more copilot-share-menu-trigger" type="button" data-action="more" data-id="${session.id}" aria-haspopup="menu" aria-expanded="false" aria-controls="${sessionMenuId}" aria-label="${moreTitle}" title="${moreTitle}">
								<span class="session-menu-glyph session-more-glyph" aria-hidden="true">•••</span>
							</button>
							<div class="copilot-share-menu-popup session-more-menu-popup" id="${sessionMenuId}" role="menu" hidden>
								<button class="copilot-share-menu-item action-btn rename" type="button" data-action="rename" data-id="${session.id}" role="menuitem" aria-label="Rename Session" ${isLocked ? "disabled" : ""}>
									<span class="copilot-share-menu-item-icon session-menu-glyph" aria-hidden="true">✎</span>
									<span class="copilot-share-menu-item-text">Rename Session</span>
								</button>
								<button class="copilot-share-menu-item action-btn delete" type="button" data-action="delete" data-id="${session.id}" role="menuitem" aria-label="Delete Session" ${isLocked ? "disabled" : ""}>
									<span class="copilot-share-menu-item-icon session-menu-glyph" aria-hidden="true">🗑</span>
									<span class="copilot-share-menu-item-text">Delete Session</span>
								</button>
							</div>
						</div>
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

function renderMessages({ preserveScroll = false } = {}) {
	hideMessageContextMenu();
	const previousScrollTop = preserveScroll ? messagesEl.scrollTop : 0;

	const active = getActiveSession();
	if (!active) {
		dialogTitleEl.textContent = "Select a session";
		if (messageSelectionStatusEl) {
			messageSelectionStatusEl.textContent = "";
			messageSelectionStatusEl.hidden = true;
		}
		messagesEl.innerHTML = `<div class="empty">Create or select a session to start your dialog</div>`;
		return;
	}

	dialogTitleEl.textContent = active.name;
	syncMessageSelectionForActiveSession(active);
	if (messageSelectionStatusEl) {
		const selectionStatus = isMessageMultiSelectMode && selectedMessageKeys.size
			? `${selectedMessageKeys.size} selected`
			: "";
		messageSelectionStatusEl.textContent = selectionStatus;
		messageSelectionStatusEl.hidden = !selectionStatus;
	}

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
		const selectedClass = isMessageSelected(active.id, msg.id) ? " is-selected" : "";
		const favoriteClass = msg.isFavorite ? " is-favorite" : "";

		parts.push(`
			<div class="message-row ${msg.role}${selectedClass}${favoriteClass}" data-message-id="${msg.id}" data-session-id="${active.id}" data-role="${msg.role}">
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
	if (preserveScroll) {
		messagesEl.scrollTop = previousScrollTop;
	} else {
		messagesEl.scrollTop = messagesEl.scrollHeight;
	}
	refreshMessageSearch({ scrollToActive: currentMatchIdx >= 0 });
}

function renderAll({ preserveMessageScroll = false } = {}) {
	renderSessionList();
	renderMessages({ preserveScroll: preserveMessageScroll });
	renderSessionSummaryPage();
	if (typeof window.syncModelPickerForActiveSession === "function") {
		window.syncModelPickerForActiveSession();
	}
	updateInputActionStates();
}

function updateInputActionStates() {
	const hasActiveSession = Boolean(getActiveSession());
	const isLocked = hasActiveSession && isActiveSessionLocked();
	const hasInFlightStream = hasActiveSession
		&& typeof window.isSessionStreamInFlight === "function"
		&& window.isSessionStreamInFlight(activeSessionId);
	if (dialogHeaderCopyBtnEl) {
		dialogHeaderCopyBtnEl.disabled = !hasActiveSession;
	}
	if (dialogHeaderShareBtnEl) {
		dialogHeaderShareBtnEl.disabled = !hasActiveSession;
	}
	if (dialogHeaderSummarizeBtnEl) {
		dialogHeaderSummarizeBtnEl.disabled = !hasActiveSession || dialogHeaderSummarizeBusy;
	}
	if (dialogTitleSummaryBtnEl) {
		const active = getActiveSession();
		const hasSummary = Boolean(active && getSessionSummaryMarkdown(active));
		dialogTitleSummaryBtnEl.disabled = !hasActiveSession || dialogHeaderSummarizeBusy || (!hasSummary && !isSessionSummaryPageOpen);
		dialogTitleSummaryBtnEl.setAttribute("aria-expanded", isSessionSummaryPageOpen ? "true" : "false");
		if (dialogHeaderSummarizeBusy) {
			dialogTitleSummaryBtnEl.title = "Summarizing in progress...";
			dialogTitleSummaryBtnEl.setAttribute("aria-label", "Summarizing in progress...");
		} else if (isSessionSummaryPageOpen) {
			dialogTitleSummaryBtnEl.title = "Back to Session";
			dialogTitleSummaryBtnEl.setAttribute("aria-label", "Back to Session");
		} else if (!hasSummary) {
			dialogTitleSummaryBtnEl.title = "No summary available yet";
			dialogTitleSummaryBtnEl.setAttribute("aria-label", "No summary available yet");
		} else {
			dialogTitleSummaryBtnEl.title = "Open Session Summary";
			dialogTitleSummaryBtnEl.setAttribute("aria-label", "Open Session Summary");
		}
	}
	if (sessionSummaryDetachBtnEl) {
		const active = getActiveSession();
		const hasSummary = Boolean(active && getSessionSummaryMarkdown(active));
		sessionSummaryDetachBtnEl.disabled = !hasActiveSession || !hasSummary;
	}
	if (dialogHeaderExportMenuItemEl) {
		dialogHeaderExportMenuItemEl.disabled = !hasActiveSession;
	}
	if (resetContextBtnEl) {
		resetContextBtnEl.disabled = !hasActiveSession || isLocked;
	}
	if (clearSessionHistoryBtnEl) {
		clearSessionHistoryBtnEl.disabled = !hasActiveSession || isLocked;
	}
	if (dialogHeaderMenuBtnEl) {
		dialogHeaderMenuBtnEl.disabled = !hasActiveSession;
		if (dialogHeaderMenuBtnEl.disabled && dialogHeaderMenuEl) {
			dialogHeaderMenuEl.hidden = true;
			dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
		}
	}
	if (dialogHeaderSearchBtnEl) {
		dialogHeaderSearchBtnEl.disabled = !hasActiveSession;
		if (dialogHeaderSearchBtnEl.disabled && !messageSearchBarEl?.hidden) {
			closeMessageSearchBar();
		}
	}
	if (sendBtnEl) {
		const hasPromptText = Boolean(promptInputEl && promptInputEl.value.trim());
		sendBtnEl.disabled = !hasActiveSession || isLocked || (!hasInFlightStream && !hasPromptText);
		sendBtnEl.textContent = hasInFlightStream && !isLocked ? "Cancel" : "Send";
		sendBtnEl.classList.toggle("is-cancel", hasInFlightStream);
		sendBtnEl.classList.toggle("is-streaming", hasInFlightStream);
	}
	if (promptInputEl) {
		promptInputEl.disabled = !hasActiveSession || isLocked;
		promptInputEl.placeholder = hasInFlightStream
			? "Response is streaming. Press Enter or Cancel to stop."
			: isLocked
				? "This session is locked. Unlock it to type."
			: defaultPromptPlaceholder;
	}
	if (modelSelectEl) {
		modelSelectEl.disabled = !hasActiveSession || isLocked || !modelSelectEl.options.length;
	}
	if (typeof window.setModelPickerLocked === "function") {
		window.setModelPickerLocked(!hasActiveSession || isLocked);
	}
}

function isActiveSessionStreamInFlight() {
	return Boolean(
		activeSessionId
		&& typeof window.isSessionStreamInFlight === "function"
		&& window.isSessionStreamInFlight(activeSessionId)
	);
}

function closeInputHintMenuIfNeeded(target) {
	if (!inputHintMenuEl || !inputHintMenuEl.open) {
		return;
	}
	if (!(target instanceof Node) || inputHintMenuEl.contains(target)) {
		return;
	}
	inputHintMenuEl.open = false;
}

// ====== User actions ======
function openSession(sessionId, fromListClick = false) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return;
	}
	activeSessionId = target.id;
	closeSessionSummaryPage();
	resetPromptHistoryNavigation();
	renderAll();
	saveState();

	if (fromListClick && window.matchMedia("(max-width: 760px)").matches) {
		appEl.classList.add("show-dialog");
	}
}

function sendUserMessage() {
	if (isActiveSessionLocked()) {
		return;
	}

	if (isActiveSessionStreamInFlight()) {
		return;
	}

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

function cancelActiveSessionStream() {
	const active = getActiveSession();
	if (!active || typeof window.cancelUserSend !== "function") {
		return;
	}
	window.cancelUserSend(active.id);
}

function handlePrimaryActionClick() {
	if (isActiveSessionStreamInFlight()) {
		cancelActiveSessionStream();
		return;
	}
	sendUserMessage();
}

async function resetActiveSessionContext() {
	const active = getActiveSession();
	if (!active || !resetContextBtnEl) {
		return;
	}
	if (isActiveSessionLocked()) {
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
	if (isActiveSessionLocked()) {
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
		timestamp: Date.now(),
		isFavorite: false
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
		timestamp: Date.now(),
		isFavorite: false
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

if (importSessionBtnEl) {
	importSessionBtnEl.addEventListener("click", () => {
		closeCopilotShareMenu();
		void importSessionFromMarkdown();
	});
}

if (exportAllSessionBtnEl) {
	exportAllSessionBtnEl.addEventListener("click", async () => {
		exportAllSessionBtnEl.disabled = true;
		const originalLabel = exportAllSessionBtnEl.innerHTML;
		exportAllSessionBtnEl.innerHTML = '<span class="copilot-share-menu-item-icon icon-export-all" aria-hidden="true"></span><span class="copilot-share-menu-item-text">Exporting...</span>';
		try {
			await downloadAllSessionsAsZip();
		} finally {
			exportAllSessionBtnEl.disabled = false;
			exportAllSessionBtnEl.innerHTML = originalLabel;
		}
		closeCopilotShareMenu();
	});
}

if (shareAllSessionRawBtnEl) {
	shareAllSessionRawBtnEl.addEventListener("click", async () => {
		shareAllSessionRawBtnEl.disabled = true;
		const originalLabel = shareAllSessionRawBtnEl.innerHTML;
		shareAllSessionRawBtnEl.innerHTML = '<span class="copilot-share-menu-item-icon icon-share-session-list" aria-hidden="true"></span><span class="copilot-share-menu-item-text">Sharing...</span>';
		try {
			await downloadAllSessionsRawMessagesAsZip();
		} finally {
			shareAllSessionRawBtnEl.disabled = false;
			shareAllSessionRawBtnEl.innerHTML = originalLabel;
		}
		closeCopilotShareMenu();
	});
}

sessionListEl.addEventListener("click", (event) => {
	if (Date.now() < suppressSessionClickUntil) {
		event.preventDefault();
		return;
	}

	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}

	const actionButton = target.closest("button[data-action]");
	if (actionButton) {
		if (actionButton.matches(":disabled") || actionButton.getAttribute("aria-disabled") === "true") {
			return;
		}

		event.stopPropagation();
		const action = actionButton.getAttribute("data-action");
		const sessionId = actionButton.getAttribute("data-id");
		if (!sessionId) {
			return;
		}
		if (action === "more") {
			toggleSessionActionMenu(actionButton);
			return;
		}
		if (action === "toggle-lock") {
			toggleSessionOpenState(sessionId);
			closeAllSessionActionMenus();
			return;
		}
		if (action === "rename") {
			renameSession(sessionId);
			closeAllSessionActionMenus();
		}
		if (action === "delete") {
			deleteSession(sessionId);
			closeAllSessionActionMenus();
 		}
		if (action !== "rename" && action !== "delete") {
			return;
		}
		return;
	}

	const item = target.closest(".session-item");
	if (!item) {
		return;
	}
	openSession(item.dataset.id, true);
});

sessionListEl.addEventListener("dragstart", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}

	if (target.closest("button") || target.closest("[role='menuitem']")) {
		event.preventDefault();
		return;
	}

	const item = target.closest(".session-item");
	if (!(item instanceof HTMLElement)) {
		return;
	}

	const sessionId = item.dataset.id;
	if (!sessionId || !event.dataTransfer) {
		return;
	}

	draggingSessionId = sessionId;
	dragDropSessionId = null;
	dragDropInsertAfter = false;
	event.dataTransfer.effectAllowed = "move";
	event.dataTransfer.setData("text/plain", sessionId);
	item.classList.add("is-dragging");
	hideSessionHoverPopup();
});

sessionListEl.addEventListener("dragover", (event) => {
	if (!draggingSessionId) {
		return;
	}

	event.preventDefault();

	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		clearSessionDropMarkers();
		dragDropSessionId = null;
		return;
	}

	const item = target.closest(".session-item");
	if (!(item instanceof HTMLElement)) {
		clearSessionDropMarkers();
		dragDropSessionId = null;
		return;
	}

	const targetSessionId = item.dataset.id;
	if (!targetSessionId || targetSessionId === draggingSessionId) {
		clearSessionDropMarkers();
		dragDropSessionId = null;
		return;
	}

	const rect = item.getBoundingClientRect();
	const insertAfter = event.clientY >= rect.top + rect.height / 2;

	clearSessionDropMarkers();
	item.classList.add(insertAfter ? "drop-after" : "drop-before");
	dragDropSessionId = targetSessionId;
	dragDropInsertAfter = insertAfter;
	if (event.dataTransfer) {
		event.dataTransfer.dropEffect = "move";
	}
});

sessionListEl.addEventListener("drop", (event) => {
	if (!draggingSessionId) {
		return;
	}

	event.preventDefault();

	let didMove = false;
	if (dragDropSessionId) {
		didMove = moveSessionInList(draggingSessionId, dragDropSessionId, dragDropInsertAfter);
	}

	clearSessionDropMarkers();
	draggingSessionId = null;
	dragDropSessionId = null;
	dragDropInsertAfter = false;

	if (didMove) {
		hasCustomSessionOrder = true;
		suppressSessionClickUntil = Date.now() + 300;
		renderAll({ preserveMessageScroll: true });
		saveState();
	}
});

sessionListEl.addEventListener("dragend", () => {
	clearSessionDropMarkers();
	draggingSessionId = null;
	dragDropSessionId = null;
	dragDropInsertAfter = false;
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

messagesEl.addEventListener("contextmenu", (event) => {
	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}

	const row = target.closest(".message-row[data-message-id]");
	if (!(row instanceof HTMLElement)) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	showMessageContextMenu(row, event.clientX, event.clientY);
});

messagesEl.addEventListener("click", (event) => {
	const target = event.target;
	if (target instanceof HTMLElement && isMessageMultiSelectMode) {
		const bubble = target.closest(".message-row[data-message-id] .bubble");
		const row = bubble instanceof HTMLElement ? bubble.closest(".message-row[data-message-id]") : null;
		if (row instanceof HTMLElement) {
			const sessionId = String(row.dataset.sessionId || "").trim();
			const messageId = String(row.dataset.messageId || "").trim();
			if (sessionId && messageId) {
				const key = getMessageSelectionKey(sessionId, messageId);
				if (selectedMessageKeys.has(key)) {
					selectedMessageKeys.delete(key);
				} else {
					selectedMessageKeys.add(key);
				}
				if (!selectedMessageKeys.size) {
					isMessageMultiSelectMode = false;
				}
				renderMessages({ preserveScroll: true });
			}
		}
	}

	hideMessageContextMenu();
});

document.addEventListener("click", (event) => {
	const inMessageMenu = event.target instanceof Element && Boolean(event.target.closest(".message-context-menu"));
	if (!inMessageMenu) {
		hideMessageContextMenu();
	}
});

document.addEventListener("contextmenu", (event) => {
	const inMessageMenu = event.target instanceof Element && Boolean(event.target.closest(".message-context-menu"));
	const inMessageRow = event.target instanceof Element && Boolean(event.target.closest(".message-row[data-message-id]"));
	if (!inMessageMenu && !inMessageRow) {
		hideMessageContextMenu();
	}
});

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
		if (messageContextMenuEl && !messageContextMenuEl.hidden) {
			hideMessageContextMenu();
			return;
		}

		if (isMessageMultiSelectMode) {
			clearMessageSelections();
			renderMessages({ preserveScroll: true });
		}
	}
});

if (messagesEl) {
	messagesEl.addEventListener("mousedown", (event) => {
		if (event.button !== 2) {
			hideMessageContextMenu();
		}
	});
}

document.addEventListener("click", async (event) => {
	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		return;
	}

	const menuAction = target.closest(".message-context-menu-item");
	if (!menuAction) {
		return;
	}
	if (menuAction instanceof HTMLButtonElement && menuAction.disabled) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	const action = String(menuAction.getAttribute("data-action") || "").trim();
	const sessionId = messageContextMenuEl ? String(messageContextMenuEl.dataset.sessionId || "").trim() : "";
	const messageId = messageContextMenuEl ? String(messageContextMenuEl.dataset.messageId || "").trim() : "";

	if (!action || !sessionId || !messageId) {
		hideMessageContextMenu();
		return;
	}

	if (action === "select-multiple") {
		if (isMessageMultiSelectMode) {
			clearMessageSelections();
		} else {
			setMessageMultiSelectMode(true, sessionId, messageId);
		}
		renderMessages({ preserveScroll: true });
		hideMessageContextMenu();
		return;
	}

	const records = getMessageRecordsForContextAction(sessionId, messageId);
	if (!records.length) {
		hideMessageContextMenu();
		return;
	}

	if (action === "copy") {
		try {
			await copyMessageRecords(records);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			window.alert(`Copy failed: ${message}`);
		}
	}

	if (action === "export") {
		exportMessageRecords(sessionId, records);
	}

	if (action === "favorites") {
		toggleFavoriteForMessageRecords(sessionId, records);
	}

	if (action === "delete") {
		deleteMessageRecords(sessionId, records);
	}

	hideMessageContextMenu();
});

sendBtnEl.addEventListener("click", handlePrimaryActionClick);

if (dialogHeaderCopyBtnEl) {
	dialogHeaderCopyBtnEl.addEventListener("click", async () => {
		if (dialogHeaderCopyBtnEl.disabled) {
			return;
		}
		const active = getActiveSession();
		if (!active || !Array.isArray(active.messages) || !active.messages.length) {
			return;
		}
		try {
			await copyMessageRecords(active.messages);
			showDialogHeaderCopyFeedback();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			window.alert(`Copy failed: ${message}`);
		}
	});
}

if (dialogHeaderShareBtnEl) {
	dialogHeaderShareBtnEl.addEventListener("click", () => {
		if (dialogHeaderShareBtnEl.disabled) {
			return;
		}
		const active = getActiveSession();
		if (!active || !Array.isArray(active.messages) || !active.messages.length) {
			return;
		}
		exportMessageRecords(active.id, active.messages);
	});
}

if (dialogHeaderSummarizeBtnEl) {
	dialogHeaderSummarizeBtnEl.addEventListener("click", async () => {
		if (dialogHeaderSummarizeBtnEl.disabled) {
			return;
		}

		const active = getActiveSession();
		if (!active || !Array.isArray(active.messages) || !active.messages.length) {
			return;
		}

		if (typeof window.summarizeSessionMessages !== "function") {
			window.alert("Summarize API is not available.");
			return;
		}

		const summarySource = buildMessageRecordsMarkdown(active.messages);
		if (!summarySource) {
			window.alert("No messages available to summarize.");
			return;
		}

		dialogHeaderSummarizeBusy = true;
		dialogHeaderSummarizeBtnEl.classList.add("is-busy");
		dialogHeaderSummarizeBtnEl.setAttribute("aria-busy", "true");
		updateInputActionStates();

		const originalTitle = dialogHeaderSummarizeBtnEl.getAttribute("title") || "Summarize Session Messages";
		dialogHeaderSummarizeBtnEl.setAttribute("title", "Summarizing...");

		try {
			const modelId = typeof active.modelId === "string" ? active.modelId.trim() : "";
			const result = await window.summarizeSessionMessages({
				sessionId: active.id,
				summarySource,
				modelId
			});
			active.summaryMarkdown = buildSessionSummaryMarkdown(result.reply, {
				sessionName: active.name,
				sessionId: active.id
			});
			saveState();
			renderSessionSummaryPage();
			showSummaryNoticeFeedback();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			window.alert(`Summarize failed: ${message}`);
		} finally {
			dialogHeaderSummarizeBtnEl.setAttribute("title", originalTitle);
			dialogHeaderSummarizeBtnEl.classList.remove("is-busy");
			dialogHeaderSummarizeBtnEl.setAttribute("aria-busy", "false");
			dialogHeaderSummarizeBusy = false;
			updateInputActionStates();
		}
	});
}

if (dialogTitleSummaryBtnEl) {
	dialogTitleSummaryBtnEl.addEventListener("click", () => {
		if (dialogTitleSummaryBtnEl.disabled) {
			return;
		}
			if (isSessionSummaryPageOpen) {
				closeSessionSummaryPage();
				return;
			}
			openSessionSummaryPage();
	});
}

if (sessionSummaryCopyBtnEl) {
	sessionSummaryCopyBtnEl.addEventListener("click", async () => {
		if (sessionSummaryCopyBtnEl.disabled) {
			return;
		}

		const active = getActiveSession();
		const markdown = active ? getSessionSummaryMarkdown(active) : "";
		if (!markdown) {
			return;
		}

		try {
			await copyTextToClipboard(markdown);
			showSessionSummaryCopyFeedback();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			window.alert(`Copy failed: ${message}`);
		}
	});
}

if (sessionSummaryShareBtnEl) {
	sessionSummaryShareBtnEl.addEventListener("click", () => {
		if (sessionSummaryShareBtnEl.disabled) {
			return;
		}

		const active = getActiveSession();
		const markdown = active ? getSessionSummaryMarkdown(active) : "";
		if (!active || !markdown) {
			return;
		}

		exportSessionSummaryMarkdown(active, markdown);
	});
}

if (sessionSummaryClearBtnEl) {
	sessionSummaryClearBtnEl.addEventListener("click", () => {
		if (sessionSummaryClearBtnEl.disabled) {
			return;
		}

		const active = getActiveSession();
		const markdown = active ? getSessionSummaryMarkdown(active) : "";
		if (!active || !markdown) {
			return;
		}

		if (!window.confirm("Clear summary for this session?")) {
			return;
		}

		active.summaryMarkdown = "";
		saveState();
		renderSessionSummaryPage();
		updateInputActionStates();
	});
}

if (sessionSummaryDetachBtnEl) {
	sessionSummaryDetachBtnEl.addEventListener("click", () => {
		if (sessionSummaryDetachBtnEl.disabled) {
			return;
		}

		openDetachedSessionSummaryWindow();
	});
}

window.addEventListener("beforeunload", () => {
	const detachedWindow = getDetachedSummaryWindow();
	if (!detachedWindow) {
		return;
	}

	try {
		detachedWindow.close();
	} catch {
		// Ignore close failures during teardown.
	}
});


// Dialog header menu logic
if (dialogHeaderMenuBtnEl && dialogHeaderMenuEl) {
	dialogHeaderMenuBtnEl.addEventListener("click", (e) => {
		if (dialogHeaderMenuBtnEl.disabled) {
			dialogHeaderMenuEl.hidden = true;
			dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
			return;
		}

		e.stopPropagation();
		const expanded = dialogHeaderMenuBtnEl.getAttribute("aria-expanded") === "true";
		if (expanded) {
			dialogHeaderMenuEl.hidden = true;
			dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
		} else {
			dialogHeaderMenuEl.hidden = false;
			dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "true");
			requestMenuPopupClamp();
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

		const inSessionMenu = e.target instanceof Element && Boolean(e.target.closest(".session-item-menu"));
		if (!inSessionMenu) {
			closeAllSessionActionMenus();
		}
	});

	// Reset Context button event (now in dialog-header menu) with confirmation
	if (resetContextBtnEl) {
		resetContextBtnEl.addEventListener("click", () => {
			if (isActiveSessionLocked()) {
				return;
			}
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

	if (dialogHeaderExportMenuItemEl) {
		dialogHeaderExportMenuItemEl.addEventListener("click", () => {
			if (dialogHeaderExportMenuItemEl.disabled) {
				return;
			}
			downloadSessionAsMarkdown();
			dialogHeaderMenuEl.hidden = true;
			dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
		});
	}
}


// Clear Session button event (now in dialog-header menu)
if (clearSessionHistoryBtnEl) {
	clearSessionHistoryBtnEl.addEventListener("click", () => {
		if (isActiveSessionLocked()) {
			return;
		}
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
		handlePrimaryActionClick();
	}
});

promptInputEl.addEventListener("input", () => {
	if (promptHistoryIndex !== -1) {
		promptHistoryIndex = -1;
		promptHistoryDraft = promptInputEl.value;
	}
	updateInputActionStates();
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

if (inputHintMenuEl) {
	document.addEventListener("click", (event) => {
		closeInputHintMenuIfNeeded(event.target);
	});
}

mobileBackBtnEl.addEventListener("click", () => {
	appEl.classList.remove("show-dialog");
});

window.addEventListener("resize", () => {
	if (!window.matchMedia("(max-width: 760px)").matches) {
		appEl.classList.remove("show-dialog");
	}
	applySidebarState();
	hideSessionHoverPopup();
	hideMessageContextMenu();
	requestMenuPopupClamp();
});

window.addEventListener("scroll", hideSessionHoverPopup, { passive: true });
window.addEventListener("scroll", hideMessageContextMenu, { passive: true });

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
