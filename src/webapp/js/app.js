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

function buildSearchPattern(query, { caseSensitive = false, useRegex = false, useWholeWord = false } = {}) {
	const rawSource = String(query || "").trim();
	if (!rawSource) {
		return null;
	}

	const flags = caseSensitive ? "g" : "gi";
	if (useRegex) {
		try {
			const source = useWholeWord ? `\\b(?:${rawSource})\\b` : rawSource;
			return new RegExp(source, flags);
		} catch {
			return null;
		}
	}

	const escapedSource = escapeRegExp(rawSource);
	const source = useWholeWord ? `\\b${escapedSource}\\b` : escapedSource;
	return new RegExp(source, flags);
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

	const pattern = buildSearchPattern(query, {
		caseSensitive,
		useRegex,
		useWholeWord
	});
	if (!pattern) {
		return [];
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

const dialogHeaderSearchBtnEl = document.getElementById("dialogHeaderSearchBtn");
const appSearchBtnEl = document.getElementById("appSearchBtn");
const appSearchBarEl = document.getElementById("appSearchBar");
const appSearchInputEl = document.getElementById("appSearchInput");
const appSearchPrevBtnEl = document.getElementById("appSearchPrevBtn");
const appSearchNextBtnEl = document.getElementById("appSearchNextBtn");
const appSearchScopeBtnEl = document.getElementById("appSearchScopeBtn");
const appSearchMatchInfoEl = document.getElementById("appSearchMatchInfo");
const closeAppSearchBtnEl = document.getElementById("closeAppSearchBtn");
const appSearchDragHandleEl = document.getElementById("appSearchDragHandle");
const appSearchCaseBtnEl = document.getElementById("appSearchCaseBtn");
const appSearchRegexBtnEl = document.getElementById("appSearchRegexBtn");
const appSearchWholeWordBtnEl = document.getElementById("appSearchWholeWordBtn");

let searchMatches = [];
let currentMatchIdx = -1;
let lastSearchQuery = "";
let isSearchCaseSensitive = false;
let isSearchRegex = false;
let isSearchWholeWord = false;
let lastSearchCaseSensitive = false;
let lastSearchRegex = false;
let lastSearchWholeWord = false;
let appSearchMatchedSessionIds = [];
const appSearchMatchedSessionIdSet = new Set();
let appSearchCurrentMatchIdx = -1;
const APP_SEARCH_SCOPE_ALL = "all";
const APP_SEARCH_SCOPE_CURRENT = "current";
let appSearchScope = APP_SEARCH_SCOPE_ALL;
let appSearchScopeLocked = false;
let lastAppSearchQuery = "";
let isAppSearchCaseSensitive = false;
let isAppSearchRegex = false;
let isAppSearchWholeWord = false;
let lastAppSearchCaseSensitive = false;
let lastAppSearchRegex = false;
let lastAppSearchWholeWord = false;
let appSearchFloatingLeft = null;
let appSearchFloatingTop = null;
let appSearchFloatingRight = null;
let appSearchFloatingBottom = null;
let appSearchDragPointerId = null;
let appSearchDragOffsetX = 0;
let appSearchDragOffsetY = 0;
const appSearchFloatingEdgePadding = {
	left: 8,
	top: 8,
	right: 8,
	bottom: 8
};
const defaultAppSearchPlaceholder = appSearchInputEl?.getAttribute("placeholder") || "Search All Sessions";
const currentSessionAppSearchPlaceholder = "Search Current Session";

function setAppSearchScope(scope) {
	appSearchScope = scope === APP_SEARCH_SCOPE_CURRENT ? APP_SEARCH_SCOPE_CURRENT : APP_SEARCH_SCOPE_ALL;
	if (!appSearchInputEl) {
		return;
	}

	appSearchInputEl.placeholder = appSearchScope === APP_SEARCH_SCOPE_CURRENT
		? currentSessionAppSearchPlaceholder
		: defaultAppSearchPlaceholder;
}

function isCurrentSessionAppSearchScope() {
	return appSearchScope === APP_SEARCH_SCOPE_CURRENT;
}

function updateAppSearchScopeButton() {
	if (!appSearchScopeBtnEl) {
		return;
	}

	let hasActiveSession = false;
	try {
		hasActiveSession = Boolean(getActiveSession());
	} catch {
		hasActiveSession = false;
	}
	const isCurrentScope = isCurrentSessionAppSearchScope();
	const label = isCurrentScope ? "Current" : "All";
	const title = isCurrentScope ? "Search Range: Current Session" : "Search Range: All Sessions";

	appSearchScopeBtnEl.textContent = label;
	appSearchScopeBtnEl.title = title;
	appSearchScopeBtnEl.setAttribute("aria-label", title);
	appSearchScopeBtnEl.setAttribute("aria-pressed", isCurrentScope ? "true" : "false");
	appSearchScopeBtnEl.disabled = appSearchScopeLocked || !hasActiveSession;
}

function toggleAppSearchScope() {
	if (appSearchScopeLocked) {
		return;
	}

	const nextScope = isCurrentSessionAppSearchScope() ? APP_SEARCH_SCOPE_ALL : APP_SEARCH_SCOPE_CURRENT;
	if (nextScope === APP_SEARCH_SCOPE_CURRENT && !getActiveSession()) {
		return;
	}

	setAppSearchScope(nextScope);
	updateAppSearchScopeButton();
	refreshAppSearch({ scrollToCurrent: true, resetIndex: true });
	if (appSearchInputEl) {
		appSearchInputEl.focus();
		appSearchInputEl.setSelectionRange(appSearchInputEl.value.length, appSearchInputEl.value.length);
	}
}

function setCurrentSearchMatch(index, { scroll = true } = {}) {
	searchMatches.forEach((match) => {
		match.classList.remove("search-highlight-current");
	});

	if (!searchMatches.length) {
		currentMatchIdx = -1;
		return;
	}

	const normalizedIndex = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
	currentMatchIdx = normalizedIndex;
	const activeMatch = searchMatches[currentMatchIdx];
	activeMatch.classList.add("search-highlight-current");

	if (scroll) {
		activeMatch.scrollIntoView({ behavior: "smooth", block: "center" });
	}
}

function applyMessageSearchFromQuery(query, options = {}, { scrollToActive = false, resetIndex = false } = {}) {
	const normalizedQuery = String(query || "").trim();
	if (!normalizedQuery) {
		clearMessageHighlights();
		searchMatches = [];
		currentMatchIdx = -1;
		lastSearchQuery = "";
		lastSearchCaseSensitive = Boolean(options.caseSensitive);
		lastSearchRegex = Boolean(options.useRegex);
		lastSearchWholeWord = Boolean(options.useWholeWord);
		return;
	}

	const previousIndex = resetIndex ? 0 : currentMatchIdx;
	searchMatches = highlightMessageMatches(normalizedQuery, {
		caseSensitive: Boolean(options.caseSensitive),
		useRegex: Boolean(options.useRegex),
		useWholeWord: Boolean(options.useWholeWord)
	});
	if (!searchMatches.length) {
		currentMatchIdx = -1;
		lastSearchQuery = normalizedQuery;
		lastSearchCaseSensitive = Boolean(options.caseSensitive);
		lastSearchRegex = Boolean(options.useRegex);
		lastSearchWholeWord = Boolean(options.useWholeWord);
		return;
	}

	const nextIndex = previousIndex >= 0 ? Math.min(previousIndex, searchMatches.length - 1) : 0;
	lastSearchQuery = normalizedQuery;
	lastSearchCaseSensitive = Boolean(options.caseSensitive);
	lastSearchRegex = Boolean(options.useRegex);
	lastSearchWholeWord = Boolean(options.useWholeWord);
	setCurrentSearchMatch(nextIndex, { scroll: scrollToActive });
}

function getAppSearchOptions() {
	return {
		caseSensitive: isAppSearchCaseSensitive,
		useRegex: isAppSearchRegex,
		useWholeWord: isAppSearchWholeWord
	};
}

function isSidebarCollapsedLayout() {
	return Boolean(appEl && appEl.classList.contains("sidebar-collapsed"));
}

function clearAppSearchFloatingInlinePosition() {
	if (!appSearchBarEl) {
		return;
	}

	appSearchBarEl.style.left = "";
	appSearchBarEl.style.top = "";
	appSearchBarEl.style.right = "";
	appSearchBarEl.style.bottom = "";
	appSearchBarEl.style.transform = "";
}

function clampAppSearchFloatingPosition(left, top) {
	if (!appSearchBarEl) {
		return appSearchFloatingEdgePadding;
	}

	const leftPadding = appSearchFloatingEdgePadding.left;
	const topPadding = appSearchFloatingEdgePadding.top;
	const rightPadding = appSearchFloatingEdgePadding.right;
	const bottomPadding = appSearchFloatingEdgePadding.bottom;
	const barWidth = appSearchBarEl.offsetWidth || 0;
	const barHeight = appSearchBarEl.offsetHeight || 0;
	const minLeft = leftPadding;
	const minTop = topPadding;
	const minRight = rightPadding;
	const minBottom = bottomPadding;
	const maxLeft = Math.max(minLeft, window.innerWidth - barWidth - rightPadding);
	const maxTop = Math.max(minTop, window.innerHeight - barHeight - bottomPadding);
	const maxRight = Math.max(minRight, window.innerWidth - barWidth - leftPadding);
	const maxBottom = Math.max(minBottom, window.innerHeight - barHeight - topPadding);
	const clampedLeft = Math.min(Math.max(minLeft, left), maxLeft);
	const clampedTop = Math.min(Math.max(minTop, top), maxTop);
	const right = window.innerWidth - clampedLeft - barWidth;
	const bottom = window.innerHeight - clampedTop - barHeight;

	return {
		left: clampedLeft,
		top: clampedTop,
		right: Math.min(Math.max(minRight, right), maxRight),
		bottom: Math.min(Math.max(minBottom, bottom), maxBottom)
	};
}

function applyAppSearchFloatingPosition() {
	if (!appSearchBarEl) {
		return;
	}

	if (!Number.isFinite(appSearchFloatingLeft) || !Number.isFinite(appSearchFloatingTop)) {
		clearAppSearchFloatingInlinePosition();
		return;
	}

	const clamped = clampAppSearchFloatingPosition(appSearchFloatingLeft, appSearchFloatingTop);
	appSearchFloatingLeft = clamped.left;
	appSearchFloatingTop = clamped.top;
	appSearchFloatingRight = clamped.right;
	appSearchFloatingBottom = clamped.bottom;
	appSearchBarEl.style.left = `${clamped.left}px`;
	appSearchBarEl.style.top = `${clamped.top}px`;
	appSearchBarEl.style.right = "";
	appSearchBarEl.style.bottom = "";
	appSearchBarEl.style.transform = "none";
}

function finishAppSearchBarDrag() {
	appSearchDragPointerId = null;
	if (appSearchBarEl) {
		appSearchBarEl.classList.remove("is-dragging");
	}
}

function handleAppSearchBarDragMove(event) {
	if (!(event instanceof PointerEvent)) {
		return;
	}

	if (event.pointerId !== appSearchDragPointerId || !appSearchBarEl || appSearchBarEl.hidden) {
		return;
	}

	const rawLeft = event.clientX - appSearchDragOffsetX;
	const rawTop = event.clientY - appSearchDragOffsetY;
	const clamped = clampAppSearchFloatingPosition(rawLeft, rawTop);
	appSearchFloatingLeft = clamped.left;
	appSearchFloatingTop = clamped.top;
	appSearchFloatingRight = clamped.right;
	appSearchFloatingBottom = clamped.bottom;
	appSearchBarEl.style.left = `${clamped.left}px`;
	appSearchBarEl.style.top = `${clamped.top}px`;
	appSearchBarEl.style.right = "";
	appSearchBarEl.style.bottom = "";
	appSearchBarEl.style.transform = "none";
	event.preventDefault();
}

function handleAppSearchBarDragEnd(event) {
	if (!(event instanceof PointerEvent) || event.pointerId !== appSearchDragPointerId) {
		return;
	}

	if (appSearchDragHandleEl instanceof HTMLElement && appSearchDragHandleEl.hasPointerCapture(event.pointerId)) {
		appSearchDragHandleEl.releasePointerCapture(event.pointerId);
	}
	finishAppSearchBarDrag();
}

function startAppSearchBarDrag(event) {
	if (!(event instanceof PointerEvent)) {
		return;
	}

	if (event.pointerType === "mouse" && event.button !== 0) {
		return;
	}

	if (!appSearchBarEl || appSearchBarEl.hidden) {
		return;
	}

	const barRect = appSearchBarEl.getBoundingClientRect();
	const left = Number.isFinite(appSearchFloatingLeft) ? appSearchFloatingLeft : barRect.left;
	const top = Number.isFinite(appSearchFloatingTop) ? appSearchFloatingTop : barRect.top;
	const clamped = clampAppSearchFloatingPosition(left, top);
	appSearchFloatingLeft = clamped.left;
	appSearchFloatingTop = clamped.top;
	appSearchFloatingRight = clamped.right;
	appSearchFloatingBottom = clamped.bottom;
	appSearchBarEl.style.left = `${clamped.left}px`;
	appSearchBarEl.style.top = `${clamped.top}px`;
	appSearchBarEl.style.right = "";
	appSearchBarEl.style.bottom = "";
	appSearchBarEl.style.transform = "none";
	appSearchDragOffsetX = event.clientX - clamped.left;
	appSearchDragOffsetY = event.clientY - clamped.top;
	appSearchDragPointerId = event.pointerId;
	appSearchBarEl.classList.add("is-dragging");
	if (appSearchDragHandleEl instanceof HTMLElement) {
		appSearchDragHandleEl.setPointerCapture(event.pointerId);
	}
	event.preventDefault();
}

function updateAppSearchOptionButtons() {
	if (appSearchCaseBtnEl) {
		appSearchCaseBtnEl.setAttribute("aria-pressed", isAppSearchCaseSensitive ? "true" : "false");
	}

	if (appSearchRegexBtnEl) {
		appSearchRegexBtnEl.setAttribute("aria-pressed", isAppSearchRegex ? "true" : "false");
	}

	if (appSearchWholeWordBtnEl) {
		appSearchWholeWordBtnEl.setAttribute("aria-pressed", isAppSearchWholeWord ? "true" : "false");
	}
}

function updateAppSearchNavigationState() {
	const hasMatches = isCurrentSessionAppSearchScope()
		? searchMatches.length > 0
		: appSearchMatchedSessionIds.length > 0;
	if (appSearchPrevBtnEl) {
		appSearchPrevBtnEl.disabled = !hasMatches;
	}
	if (appSearchNextBtnEl) {
		appSearchNextBtnEl.disabled = !hasMatches;
	}
}

function updateAppSearchMatchInfo() {
	if (!appSearchMatchInfoEl) {
		return;
	}

	if (isCurrentSessionAppSearchScope()) {
		if (!searchMatches.length || currentMatchIdx < 0) {
			appSearchMatchInfoEl.textContent = "0/0";
			return;
		}

		appSearchMatchInfoEl.textContent = `${currentMatchIdx + 1}/${searchMatches.length}`;
		return;
	}

	if (!appSearchMatchedSessionIds.length || appSearchCurrentMatchIdx < 0) {
		appSearchMatchInfoEl.textContent = "0/0";
		return;
	}

	appSearchMatchInfoEl.textContent = `${appSearchCurrentMatchIdx + 1}/${appSearchMatchedSessionIds.length}`;
}

function syncAppSearchMatchedSessionSet() {
	appSearchMatchedSessionIdSet.clear();
	for (const sessionId of appSearchMatchedSessionIds) {
		appSearchMatchedSessionIdSet.add(sessionId);
	}
}

function syncSessionListAppSearchHighlights({ scrollToCurrent = false } = {}) {
	renderSessionList();

	if (!scrollToCurrent || appSearchCurrentMatchIdx < 0) {
		return;
	}

	const currentMatchSessionId = appSearchMatchedSessionIds[appSearchCurrentMatchIdx];
	if (!currentMatchSessionId || !sessionListEl) {
		return;
	}

	const currentItem = sessionListEl.querySelector(`.session-item[data-id="${CSS.escape(currentMatchSessionId)}"]`);
	if (currentItem instanceof HTMLElement) {
		currentItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}
}

function collectMatchedSessionIdsForAppSearch(query, options = {}) {
	const pattern = buildSearchPattern(query, options);
	if (!pattern) {
		return [];
	}

	const targetSessions = appSearchScope === APP_SEARCH_SCOPE_CURRENT
		? sessions.filter((session) => session.id === activeSessionId)
		: sessions;

	const matchedIds = [];
	for (const session of targetSessions) {
		const matched = Array.isArray(session.messages) && session.messages.some((message) => {
			const text = String(message?.text || "");
			pattern.lastIndex = 0;
			return pattern.test(text);
		});

		if (matched) {
			matchedIds.push(session.id);
		}
	}

	return matchedIds;
}

function applySessionSearchFromAppQuery(query, options = {}) {
	const normalizedQuery = String(query || "").trim();
	applyMessageSearchFromQuery(normalizedQuery, options, { scrollToActive: true, resetIndex: true });
}

function setCurrentAppSearchMatch(index, { scroll = true, openSessionForMatch = false, preserveAppSearchFocus = false } = {}) {
	if (!appSearchMatchedSessionIds.length) {
		appSearchCurrentMatchIdx = -1;
		updateAppSearchMatchInfo();
		updateAppSearchNavigationState();
		syncSessionListAppSearchHighlights();
		return;
	}

	const normalizedIndex = ((index % appSearchMatchedSessionIds.length) + appSearchMatchedSessionIds.length) % appSearchMatchedSessionIds.length;
	appSearchCurrentMatchIdx = normalizedIndex;
	updateAppSearchMatchInfo();
	updateAppSearchNavigationState();
	syncSessionListAppSearchHighlights({ scrollToCurrent: scroll });

	if (!openSessionForMatch || appSearchScope === APP_SEARCH_SCOPE_CURRENT) {
		return;
	}

	const sessionId = appSearchMatchedSessionIds[appSearchCurrentMatchIdx];
	if (!sessionId) {
		return;
	}

	openSession(sessionId, false, {
		appSearchQuery: appSearchInputEl ? appSearchInputEl.value.trim() : "",
		appSearchOptions: getAppSearchOptions()
	});
}

function refreshAppSearch({ scrollToCurrent = false, resetIndex = false } = {}) {
	if (!appSearchBarEl || appSearchBarEl.hidden) {
		return;
	}

	const query = appSearchInputEl ? appSearchInputEl.value.trim() : "";
	if (!query) {
		appSearchMatchedSessionIds = [];
		syncAppSearchMatchedSessionSet();
		appSearchCurrentMatchIdx = -1;
		applyMessageSearchFromQuery("", getAppSearchOptions(), { resetIndex: true });
		lastAppSearchQuery = "";
		lastAppSearchCaseSensitive = isAppSearchCaseSensitive;
		lastAppSearchRegex = isAppSearchRegex;
		lastAppSearchWholeWord = isAppSearchWholeWord;
		updateAppSearchMatchInfo();
		updateAppSearchNavigationState();
		syncSessionListAppSearchHighlights();
		return;
	}

	const previousMatchedSessionId = !resetIndex && appSearchCurrentMatchIdx >= 0
		? appSearchMatchedSessionIds[appSearchCurrentMatchIdx]
		: "";

	appSearchMatchedSessionIds = collectMatchedSessionIdsForAppSearch(query, getAppSearchOptions());
	syncAppSearchMatchedSessionSet();

	if (!appSearchMatchedSessionIds.length) {
		appSearchCurrentMatchIdx = -1;
		if (appSearchScope === APP_SEARCH_SCOPE_CURRENT) {
			applyMessageSearchFromQuery("", getAppSearchOptions(), { resetIndex: true });
		}
		lastAppSearchQuery = query;
		lastAppSearchCaseSensitive = isAppSearchCaseSensitive;
		lastAppSearchRegex = isAppSearchRegex;
		lastAppSearchWholeWord = isAppSearchWholeWord;
		updateAppSearchMatchInfo();
		updateAppSearchNavigationState();
		syncSessionListAppSearchHighlights();
		return;
	}

	let nextIndex = 0;
	if (previousMatchedSessionId) {
		const previousIndex = appSearchMatchedSessionIds.indexOf(previousMatchedSessionId);
		if (previousIndex >= 0) {
			nextIndex = previousIndex;
		}
	}

	lastAppSearchQuery = query;
	lastAppSearchCaseSensitive = isAppSearchCaseSensitive;
	lastAppSearchRegex = isAppSearchRegex;
	lastAppSearchWholeWord = isAppSearchWholeWord;
	setCurrentAppSearchMatch(nextIndex, { scroll: scrollToCurrent });

	if (appSearchScope === APP_SEARCH_SCOPE_CURRENT) {
		applySessionSearchFromAppQuery(query, getAppSearchOptions());
		updateAppSearchMatchInfo();
		updateAppSearchNavigationState();
	}
}

function openAppSearchBar({ scope = APP_SEARCH_SCOPE_ALL, lockScope = false } = {}) {
	if (!appSearchBarEl || !appSearchBtnEl) {
		return;
	}

	appSearchScopeLocked = Boolean(lockScope);
	setAppSearchScope(scope);
	updateAppSearchScopeButton();
	appSearchBarEl.hidden = false;
	applyAppSearchFloatingPosition();
	updateAppSearchOptionButtons();
	window.requestAnimationFrame(() => {
		if (appSearchInputEl) {
			appSearchInputEl.focus();
			appSearchInputEl.select();
		}
	});
	refreshAppSearch();
}

function closeAppSearchBar({ restoreTriggerFocus = true } = {}) {
	if (!appSearchBarEl || !appSearchBtnEl) {
		return;
	}

	finishAppSearchBarDrag();
	appSearchBarEl.hidden = true;
	if (appSearchInputEl) {
		appSearchInputEl.value = "";
	}
	appSearchMatchedSessionIds = [];
	syncAppSearchMatchedSessionSet();
	appSearchCurrentMatchIdx = -1;
	applyMessageSearchFromQuery("", getAppSearchOptions(), { resetIndex: true });
	appSearchScopeLocked = false;
	setAppSearchScope(APP_SEARCH_SCOPE_ALL);
	updateAppSearchScopeButton();
	lastAppSearchQuery = "";
	lastAppSearchCaseSensitive = isAppSearchCaseSensitive;
	lastAppSearchRegex = isAppSearchRegex;
	lastAppSearchWholeWord = isAppSearchWholeWord;
	updateAppSearchMatchInfo();
	updateAppSearchNavigationState();
	syncSessionListAppSearchHighlights();
	if (restoreTriggerFocus) {
		appSearchBtnEl.focus();
	}
}

function toggleAppSearchBar({ scope = APP_SEARCH_SCOPE_ALL, lockScope = false } = {}) {
	if (!appSearchBarEl) {
		return;
	}

	if (appSearchBarEl.hidden) {
		openAppSearchBar({ scope, lockScope });
		return;
	}

	if (appSearchScope !== scope) {
		openAppSearchBar({ scope, lockScope });
		return;
	}

	closeAppSearchBar();
}

function runAppSearch() {
	refreshAppSearch({ scrollToCurrent: true, resetIndex: true });
	if (!appSearchMatchedSessionIds.length) {
		updateAppSearchMatchInfo();
	}
	if (appSearchInputEl) {
		appSearchInputEl.focus();
		appSearchInputEl.setSelectionRange(appSearchInputEl.value.length, appSearchInputEl.value.length);
	}
}

function gotoPrevAppSearchMatch({ preserveAppSearchFocus = false } = {}) {
	if (isCurrentSessionAppSearchScope()) {
		if (!searchMatches.length) {
			return;
		}

		setCurrentSearchMatch(currentMatchIdx - 1);
		updateAppSearchMatchInfo();
		updateAppSearchNavigationState();
	} else {
		if (!appSearchMatchedSessionIds.length) {
			return;
		}

		let prevIndex = appSearchCurrentMatchIdx - 1;
		if (prevIndex < 0) {
			prevIndex = appSearchMatchedSessionIds.length - 1;
		}
		setCurrentAppSearchMatch(prevIndex, { openSessionForMatch: true, preserveAppSearchFocus });
	}

	if (appSearchInputEl) {
		appSearchInputEl.focus();
		appSearchInputEl.setSelectionRange(appSearchInputEl.value.length, appSearchInputEl.value.length);
	}
}

function gotoNextAppSearchMatch({ preserveAppSearchFocus = false } = {}) {
	if (isCurrentSessionAppSearchScope()) {
		if (!searchMatches.length) {
			return;
		}

		setCurrentSearchMatch(currentMatchIdx + 1);
		updateAppSearchMatchInfo();
		updateAppSearchNavigationState();
	} else {
		if (!appSearchMatchedSessionIds.length) {
			return;
		}

		let nextIndext = appSearchCurrentMatchIdx + 1;
		if (nextIndext >= appSearchMatchedSessionIds.length) {
			nextIndext = 0;
		}
		setCurrentAppSearchMatch(nextIndext, { openSessionForMatch: true, preserveAppSearchFocus });
	}

	if (appSearchInputEl) {
		appSearchInputEl.focus();
		appSearchInputEl.setSelectionRange(appSearchInputEl.value.length, appSearchInputEl.value.length);
	}
}

function navigateAppSearchMatchesByWheel(direction) {
	if (!appSearchBarEl || appSearchBarEl.hidden || !appSearchMatchedSessionIds.length) {
		return false;
	}

	if (direction < 0) {
		gotoPrevAppSearchMatch();
		return true;
	}

	if (direction > 0) {
		gotoNextAppSearchMatch();
		return true;
	}

	return false;
}

function handleAppSearchWheel(event) {
	const direction = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0;
	if (!direction) {
		return;
	}

	const handled = navigateAppSearchMatchesByWheel(direction);
	if (handled) {
		event.preventDefault();
	}
}

function toggleAppSearchCaseSensitive() {
	isAppSearchCaseSensitive = !isAppSearchCaseSensitive;
	updateAppSearchOptionButtons();
	refreshAppSearch({ scrollToCurrent: true, resetIndex: true });
	if (appSearchInputEl) {
		appSearchInputEl.focus();
	}
}

function toggleAppSearchRegex() {
	isAppSearchRegex = !isAppSearchRegex;
	updateAppSearchOptionButtons();
	refreshAppSearch({ scrollToCurrent: true, resetIndex: true });
	if (appSearchInputEl) {
		appSearchInputEl.focus();
	}
}

function toggleAppSearchWholeWord() {
	isAppSearchWholeWord = !isAppSearchWholeWord;
	updateAppSearchOptionButtons();
	refreshAppSearch({ scrollToCurrent: true, resetIndex: true });
	if (appSearchInputEl) {
		appSearchInputEl.focus();
	}
}

function getOpenSessionOptionsForAppSearchMatch(item) {
	if (!(item instanceof HTMLElement) || !item.classList.contains("session-item-app-match")) {
		return null;
	}

	const query = appSearchInputEl ? appSearchInputEl.value.trim() : "";
	if (!query) {
		return null;
	}

	return {
		appSearchQuery: query,
		appSearchOptions: getAppSearchOptions()
	};
}

if (dialogHeaderSearchBtnEl) {
	dialogHeaderSearchBtnEl.addEventListener("click", () => {
		if (!appSearchBarEl || appSearchBarEl.hidden) {
			openAppSearchBar({ scope: APP_SEARCH_SCOPE_CURRENT, lockScope: true });
			return;
		}

		if (appSearchScopeLocked) {
			closeAppSearchBar({ restoreTriggerFocus: false });
			dialogHeaderSearchBtnEl.focus();
		}
	});
}
if (appSearchBtnEl) {
	appSearchBtnEl.addEventListener("click", () => {
		if (!appSearchBarEl) {
			return;
		}

		if (!appSearchBarEl.hidden && appSearchScopeLocked) {
			return;
		}

		toggleAppSearchBar({ scope: APP_SEARCH_SCOPE_ALL, lockScope: false });
	});
}
if (appSearchScopeBtnEl) {
	appSearchScopeBtnEl.addEventListener("click", toggleAppSearchScope);
}
if (closeAppSearchBtnEl) {
	closeAppSearchBtnEl.addEventListener("click", closeAppSearchBar);
}
if (appSearchInputEl) {
	appSearchInputEl.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			const query = appSearchInputEl.value.trim();
			const canNavigateExistingResults =
				Boolean(query)
				&& query === lastAppSearchQuery
				&& isAppSearchCaseSensitive === lastAppSearchCaseSensitive
				&& isAppSearchRegex === lastAppSearchRegex
				&& isAppSearchWholeWord === lastAppSearchWholeWord
				&& appSearchMatchedSessionIds.length > 0
				&& appSearchCurrentMatchIdx >= 0;

			if (canNavigateExistingResults) {
				gotoNextAppSearchMatch({ preserveAppSearchFocus: true });
			} else {
				runAppSearch();
			}
		}

		if (event.key === "Escape") {
			event.preventDefault();
			closeAppSearchBar({ restoreTriggerFocus: false });
		}
	});
}
if (appSearchPrevBtnEl) {
	appSearchPrevBtnEl.addEventListener("click", gotoPrevAppSearchMatch);
}
if (appSearchNextBtnEl) {
	appSearchNextBtnEl.addEventListener("click", gotoNextAppSearchMatch);
}
if (appSearchCaseBtnEl) {
	appSearchCaseBtnEl.addEventListener("click", toggleAppSearchCaseSensitive);
}
if (appSearchRegexBtnEl) {
	appSearchRegexBtnEl.addEventListener("click", toggleAppSearchRegex);
}
if (appSearchWholeWordBtnEl) {
	appSearchWholeWordBtnEl.addEventListener("click", toggleAppSearchWholeWord);
}
if (appSearchBarEl) {
	appSearchBarEl.addEventListener("wheel", handleAppSearchWheel, { passive: false });
}
if (appSearchDragHandleEl) {
	appSearchDragHandleEl.addEventListener("pointerdown", startAppSearchBarDrag);
}
window.addEventListener("pointermove", handleAppSearchBarDragMove);
window.addEventListener("pointerup", handleAppSearchBarDragEnd);
window.addEventListener("pointercancel", handleAppSearchBarDragEnd);

updateAppSearchOptionButtons();
updateAppSearchMatchInfo();
updateAppSearchNavigationState();
// ====== Storage keys ======
const STORAGE_KEY = "llm-dialog-sessions-v1";
const ACTIVE_KEY = "llm-dialog-active-session";
const SIDEBAR_KEY = "llm-dialog-sidebar-collapsed-v1";
const CUSTOM_ORDER_KEY = "llm-dialog-session-custom-order-v1";
const INPUT_MORE_ACTIONS_PROMPT_SUGGESTION_KEY = "llm-dialog-input-disable-prompt-suggestions-v1";

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
let originalPromptCopyFeedbackTimeoutId = null;
let summaryNoticeTimeoutId = null;
let summaryNoticeSessionId = "";
let dialogHeaderSummarizeBusy = false;
let dialogHeaderSummarizeBusySessionId = "";
let promptPolisherBusy = false;
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
let isPromptSuggestionDisabled = false;

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
const promptSuggestionPopupEl = document.getElementById("promptSuggestionPopup");
const inputAreaEl = document.querySelector(".input-area");
const inputAreaResizerEl = document.getElementById("inputAreaResizer");
const inputMoreActionsBtnEl = document.getElementById("inputMoreActionsBtn");
const inputMoreActionsMenuEl = document.getElementById("inputMoreActionsMenu");
const togglePromptSuggestionsMenuItemEl = document.getElementById("togglePromptSuggestionsMenuItem");
const togglePromptSuggestionsMenuIconEl = document.getElementById("togglePromptSuggestionsMenuIcon");
const togglePromptSuggestionsMenuLabelEl = document.getElementById("togglePromptSuggestionsMenuLabel");
const dialogEl = document.querySelector(".dialog");
const dialogHeaderEl = document.querySelector(".dialog-header");
const modelSelectEl = document.getElementById("modelSelect");
const importSessionBtnEl = document.getElementById("importSessionBtn");
const exportAllSessionBtnEl = document.getElementById("exportAllSessionBtn");
const shareAllSessionRawBtnEl = document.getElementById("shareAllSessionRawBtn");
const clearSessionHistoryBtnEl = document.getElementById("clearSessionHistoryBtn");
const resetContextBtnEl = document.getElementById("resetContextBtn");
const dialogHeaderCopyBtnEl = document.getElementById("dialogHeaderCopyBtn");
const dialogHeaderShareBtnEl = document.getElementById("dialogHeaderShareBtn");
const dialogHeaderFullscreenBtnEl = document.getElementById("dialogHeaderFullscreenBtn");
const dialogHeaderFullscreenBtn2El = document.getElementById("dialogHeaderFullscreenBtn2");
const dialogHeaderFullscreenSeparatorEl = document.getElementById("dialogHeaderFullscreenSeparator");
const dialogHeaderSummarizeBtnEl = document.getElementById("dialogHeaderSummarizeBtn");
const dialogHeaderExportMenuItemEl = document.getElementById("dialogHeaderExportMenuItem");
const dialogHeaderMenuBtnEl = document.getElementById("dialogHeaderMenuBtn");
const dialogHeaderMenuEl = document.getElementById("dialogHeaderMenu");
const copilotShareMenuBtnEl = document.getElementById("copilotShareMenuBtn");
const copilotShareMenuEl = document.getElementById("copilotShareMenu");
const promptPolisherBtnEl = document.getElementById("promptPolisherBtn");
const originalPromptBtnEl = document.getElementById("originalPromptBtn");
const sendBtnEl = document.getElementById("sendBtn");
const inputHintMenuEl = document.getElementById("inputHintMenu");
const mobileBackBtnEl = document.getElementById("mobileBackBtn");
const sidebarToggleBtnEl = document.getElementById("sidebarToggleBtn");
const sidebarEl = document.querySelector(".sidebar");
const defaultPromptPlaceholder = promptInputEl?.getAttribute("placeholder") || "Type your request to Copilot...";

function checkMobileDevice() {
	const userAgent = navigator.userAgent || "";
	const platform = navigator.platform || "";
	const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
	const isAndroidDevice = /Android/i.test(userAgent);
	const isIPhoneDevice = /iPhone/i.test(userAgent);
	const isIOSDevice = /iPad|iPod|iPhone/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
	const isMobileUAData = Boolean(navigator.userAgentData && navigator.userAgentData.mobile);
	const isSmallCoarsePointer = Boolean(window.matchMedia && window.matchMedia("(max-width: 900px) and (pointer: coarse)").matches);
	return isAndroidDevice || isIPhoneDevice || isMobileUAData || (isIOSDevice && isSmallCoarsePointer);
}

function syncFullscreenButtonVisibilityForDevice() {
	const showMenuFullscreenButton = isMobileDevice;
	if (dialogHeaderFullscreenBtnEl) {
		dialogHeaderFullscreenBtnEl.hidden = showMenuFullscreenButton;
	}
	if (dialogHeaderFullscreenBtn2El) {
		dialogHeaderFullscreenBtn2El.hidden = !showMenuFullscreenButton;
	}
	if (dialogHeaderFullscreenSeparatorEl) {
		dialogHeaderFullscreenSeparatorEl.hidden = !showMenuFullscreenButton;
	}
}

const isMobileDevice = checkMobileDevice();
syncFullscreenButtonVisibilityForDevice();
if (isMobileDevice) {
	if (sidebarToggleBtnEl) {
		sidebarToggleBtnEl.hidden = true;
		sidebarToggleBtnEl.setAttribute("hidden", "");
		sidebarToggleBtnEl.style.setProperty("display", "none", "important");
	}
	if (inputHintMenuEl) {
		inputHintMenuEl.open = false;
		inputHintMenuEl.hidden = true;
	}
}

let sessionHoverPopupEl = null;
let messageContextMenuEl = null;
let activeMessageContextId = null;
let isMessageMultiSelectMode = false;
let promptSuggestions = [];
let activePromptSuggestionIndex = -1;
const selectedMessageKeys = new Set();
let inputAreaResizePointerId = null;
let inputAreaResizeStartY = 0;
let inputAreaResizeStartHeight = 0;
let inputAreaBaseHeight = 0;
let inputAreaChromeHeight = 0;
const minDialogContentHeight = 96;

const MESSAGE_CONTEXT_MENU_ITEMS = [
	{ action: "copy", label: "Copy", glyph: "⧉" },
	{ action: "share", label: "Share", glyph: "⤴" },
	{ action: "favorites", label: "Favorites", glyph: "☆" },
	{ action: "select-multiple", label: "Select Multiple", glyph: "✓" },
	{ action: "retry", label: "Retry", glyph: "↻", role: "user" },
	{ action: "delete", label: "Delete", glyph: "×", danger: true }
];

function getInputAreaHeightBounds() {
	if (!(inputAreaEl instanceof HTMLElement)) {
		return { min: 0, max: 0 };
	}

	const minHeight = inputAreaBaseHeight || Math.ceil(inputAreaEl.getBoundingClientRect().height) || 0;
	if (!(dialogEl instanceof HTMLElement) || !(dialogHeaderEl instanceof HTMLElement)) {
		return { min: minHeight, max: minHeight };
	}

	const dialogHeight = Math.ceil(dialogEl.getBoundingClientRect().height);
	const headerHeight = Math.ceil(dialogHeaderEl.getBoundingClientRect().height);
	const maxHeight = Math.max(minHeight, dialogHeight - headerHeight - minDialogContentHeight);
	return { min: minHeight, max: maxHeight };
}

function applyInputAreaHeight(height) {
	if (!(inputAreaEl instanceof HTMLElement)) {
		return;
	}

	const { min, max } = getInputAreaHeightBounds();
	const clampedHeight = Math.max(min, Math.min(max, Math.round(Number(height) || 0)));
	inputAreaEl.style.height = `${clampedHeight}px`;

	if (promptInputEl instanceof HTMLTextAreaElement) {
		const chrome = inputAreaChromeHeight || 0;
		const textareaHeight = Math.max(70, clampedHeight - chrome);
		promptInputEl.style.height = `${textareaHeight}px`;
		promptInputEl.style.maxHeight = `${textareaHeight}px`;
	}
}

function clampInputAreaHeight() {
	if (!(inputAreaEl instanceof HTMLElement) || !inputAreaEl.style.height) {
		return;
	}

	const currentHeight = Math.ceil(inputAreaEl.getBoundingClientRect().height);
	applyInputAreaHeight(currentHeight);
}

function endInputAreaResize() {
	if (!(inputAreaResizerEl instanceof HTMLElement)) {
		return;
	}

	if (inputAreaResizePointerId !== null) {
		inputAreaResizerEl.releasePointerCapture(inputAreaResizePointerId);
	}
	inputAreaResizePointerId = null;
	document.body.classList.remove("is-resizing-input-area");
}

function onInputAreaResizerPointerDown(event) {
	if (!(inputAreaEl instanceof HTMLElement) || !(inputAreaResizerEl instanceof HTMLElement)) {
		return;
	}

	if (event.button !== 0) {
		return;
	}

	const footerHeight = Math.ceil(inputAreaEl.getBoundingClientRect().height);
	if (!inputAreaBaseHeight) {
		inputAreaBaseHeight = footerHeight;
	}

	if (promptInputEl instanceof HTMLTextAreaElement) {
		const promptHeight = Math.ceil(promptInputEl.getBoundingClientRect().height);
		inputAreaChromeHeight = Math.max(0, footerHeight - promptHeight);
	}

	inputAreaResizePointerId = event.pointerId;
	inputAreaResizeStartY = event.clientY;
	inputAreaResizeStartHeight = footerHeight;
	inputAreaResizerEl.setPointerCapture(event.pointerId);
	document.body.classList.add("is-resizing-input-area");
	event.preventDefault();
}

function onInputAreaResizerPointerMove(event) {
	if (inputAreaResizePointerId === null || event.pointerId !== inputAreaResizePointerId) {
		return;
	}

	const deltaY = inputAreaResizeStartY - event.clientY;
	applyInputAreaHeight(inputAreaResizeStartHeight + deltaY);
	event.preventDefault();
}

function initializeInputAreaResize() {
	if (!(inputAreaEl instanceof HTMLElement) || !(inputAreaResizerEl instanceof HTMLElement)) {
		return;
	}

	const footerHeight = Math.ceil(inputAreaEl.getBoundingClientRect().height);
	inputAreaBaseHeight = footerHeight;
	if (promptInputEl instanceof HTMLTextAreaElement) {
		const promptHeight = Math.ceil(promptInputEl.getBoundingClientRect().height);
		inputAreaChromeHeight = Math.max(0, footerHeight - promptHeight);
	}

	inputAreaResizerEl.addEventListener("pointerdown", onInputAreaResizerPointerDown);
	inputAreaResizerEl.addEventListener("pointermove", onInputAreaResizerPointerMove);
	inputAreaResizerEl.addEventListener("pointerup", endInputAreaResize);
	inputAreaResizerEl.addEventListener("pointercancel", endInputAreaResize);
	inputAreaResizerEl.addEventListener("lostpointercapture", endInputAreaResize);
}

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

function setMessageContextMenuItemPresentation(action, { label, glyph, disabled = false, hidden = false } = {}) {
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
	itemEl.hidden = Boolean(hidden);
	itemEl.style.display = itemEl.hidden ? "none" : "";
	itemEl.setAttribute("aria-hidden", itemEl.hidden ? "true" : "false");
	itemEl.disabled = itemEl.hidden ? true : Boolean(disabled);
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
	const focusedRole = messageContextMenuEl ? String(messageContextMenuEl.dataset.role || "").trim() : "";
	const showRetryAction = !isBatch && focusedRole === "user";

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
	setMessageContextMenuItemPresentation("retry", {
		label: "Retry",
		disabled: isLocked || count < 1,
		hidden: !showRetryAction
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

function showOriginalPromptCopyFeedback() {
	if (!originalPromptBtnEl) {
		return;
	}

	originalPromptBtnEl.classList.remove("is-copied");
	void originalPromptBtnEl.offsetWidth;
	originalPromptBtnEl.classList.add("is-copied");

	if (originalPromptCopyFeedbackTimeoutId) {
		window.clearTimeout(originalPromptCopyFeedbackTimeoutId);
	}

	originalPromptCopyFeedbackTimeoutId = window.setTimeout(() => {
		originalPromptBtnEl?.classList.remove("is-copied");
		originalPromptCopyFeedbackTimeoutId = null;
	}, 1200);
}

function showSummaryNoticeFeedback(sessionId) {
	const normalizedSessionId = String(sessionId || "").trim();
	if (!normalizedSessionId) {
		return;
	}

	summaryNoticeSessionId = normalizedSessionId;
	syncSummaryNoticeHighlightState();
	renderSessionList();

	if (summaryNoticeTimeoutId) {
		window.clearTimeout(summaryNoticeTimeoutId);
	}

	summaryNoticeTimeoutId = window.setTimeout(() => {
		summaryNoticeSessionId = "";
		syncSummaryNoticeHighlightState();
		renderSessionList();
		summaryNoticeTimeoutId = null;
	}, 2600);
}

function syncSummaryNoticeHighlightState() {
	if (!dialogTitleSummaryBtnEl) {
		return;
	}

	const shouldHighlight = Boolean(summaryNoticeSessionId) && activeSessionId === summaryNoticeSessionId;
	dialogTitleSummaryBtnEl.classList.toggle("has-new-summary", shouldHighlight);
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

const emojisForSessionMD = { metadata:'📌', summary:'📝', conversation:'💬' };
function buildSessionSummaryMarkdown(summaryText, { sessionName = "Session", sessionId = "" } = {}) {
	const generatedAt = Date.now();
	const cleanedSummary = String(summaryText || "").replace(/\r\n/g, "\n").trim();
	if (!cleanedSummary) {
		return "";
	}

	const lines = [
		`## ${emojisForSessionMD.summary} Session Summary`,
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
		: getNoSummaryHintHtml();

	return {
		sessionName,
		contentHtml
	};
}

function getNoSummaryHintHtml() {
	return '<div class="session-summary-empty">No summary is available for this session yet.<br>Press the Summarize button (<span class="session-summary-empty-icon" aria-hidden="true"></span>) to generate one.</div>';
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
	if (!active) {
		return;
	}

	renderSessionSummaryPage();

	let detachedWindow = getDetachedSummaryWindow();
	if (!detachedWindow) {
		const width = 560;
		const height = 520;
		const left = Math.max(0, Math.round(window.screenX + Math.max(24, (window.outerWidth - width) / 2)));
		const top = Math.max(0, Math.round(window.screenY + Math.max(24, (window.outerHeight - height) / 2)));
		const summaryMiniUrl = new URL("./summary/summary-mini.html", window.location.href).href;
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
	if (dialogHeaderSummarizeBtnEl) {
		dialogHeaderSummarizeBtnEl.hidden = !isSessionSummaryPageOpen;
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
		sessionSummaryContentEl.innerHTML = getNoSummaryHintHtml();
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
			sessionSummaryDetachBtnEl.disabled = false;
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
	const summaryMarkdown = getSessionSummaryMarkdown(session);
	const lines = [];
	lines.push(`# ${String(session.name || "Session")}`);
	lines.push("");
	lines.push(`## ${emojisForSessionMD.metadata} Session Metadata`);
	lines.push("");
	lines.push(`- Session Name: ${String(session.name || "")}`);
	lines.push(`- Session ID: ${String(session.id || "")}`);
	lines.push(`- Current Model: ${model.name}`);
	lines.push(`- Current Model ID: ${model.id || "Unknown"}`);
	lines.push(`- Exported At: ${formatDateTime(Date.now())}`);

	lines.push("");
	if (summaryMarkdown) {
		if (!summaryMarkdown.includes("Session Summary")) {
			lines.push(`## ${emojisForSessionMD.summary} Session Summary`);
		}
		lines.push(summaryMarkdown);
	} else {
		lines.push(`## ${emojisForSessionMD.summary} Session Summary`);
		lines.push("_No summary for this session._");
	}

	lines.push("");
	lines.push(`## ${emojisForSessionMD.conversation} Conversation Messages`);
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

function parseSessionSummaryFromMarkdown(markdown) {
	const normalized = String(markdown || "").replace(/\r\n/g, "\n");
	const lines = normalized.split("\n");
	const summaryHeadingIndex = lines.findIndex((line) => /^(##)\s+.*Session Summary\s*$/.test(String(line || "").trim()));
	if (summaryHeadingIndex < 0) {
		return "";
	}

	let summaryEndIndex = lines.length;
	for (let index = summaryHeadingIndex + 1; index < lines.length; index += 1) {
		if (/^(##)\s+.*Conversation Messages\s*$/.test(String(lines[index] || "").trim())) {
			summaryEndIndex = index;
			break;
		}
	}

	const section = lines.slice(summaryHeadingIndex, summaryEndIndex).join("\n").trim();
	if (!section) {
		return "";
	}

	const noSummaryMarker = "_No summary for this session._";
	if (section === noSummaryMarker || section.endsWith(`\n${noSummaryMarker}`)) {
		return "";
	}

	return section;
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
	const parsedSummary = parseSessionSummaryFromMarkdown(markdown);
	return {
		id: metadata.sessionId,
		name: metadata.sessionName,
		modelId: metadata.currentModelId,
		summaryMarkdown: parsedSummary,
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
	const sessionsToPersist = sessions.map((session) => {
		if (!session || typeof session !== "object") {
			return session;
		}

		const { lastOriginalPrompt, hasCompletedPromptPolish, ...persistedSession } = session;
		return persistedSession;
	});

	localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionsToPersist));
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

	if (typeof session.isPinned !== "boolean") {
		session.isPinned = false;
	}

	if (typeof session.summaryMarkdown !== "string") {
		session.summaryMarkdown = "";
	}

	if (typeof session.lastOriginalPrompt !== "string") {
		session.lastOriginalPrompt = "";
	}

	if (typeof session.hasCompletedPromptPolish !== "boolean") {
		session.hasCompletedPromptPolish = false;
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
		if (session && typeof session === "object") {
			session.lastOriginalPrompt = "";
			session.hasCompletedPromptPolish = false;
		}
	});

	sessions.forEach((session) => {
		normalizeSessionState(session);
	});

	const storedActive = localStorage.getItem(ACTIVE_KEY);
	const found = sessions.find((item) => item.id === storedActive);
	activeSessionId = found ? found.id : sessions[0]?.id || null;

	isSidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === "1";
	hasCustomSessionOrder = localStorage.getItem(CUSTOM_ORDER_KEY) === "1";
	isPromptSuggestionDisabled = localStorage.getItem(INPUT_MORE_ACTIONS_PROMPT_SUGGESTION_KEY) === "1";
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

	applyAppSearchFloatingPosition();

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

function normalizeSimilarityText(value) {
	return String(value || "")
		.normalize("NFKC")
		.toLocaleLowerCase()
		.replace(/\s+/gu, " ")
		.trim();
}

const similarityWordSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
	? new Intl.Segmenter(undefined, { granularity: "word" })
	: null;
const similarityChineseWordSegmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
	? new Intl.Segmenter("zh", { granularity: "word" })
	: null;
const SIMILARITY_CHINESE_STOP_TOKENS = new Set([
	"的", "了", "呢", "吗", "啊", "吧", "呀", "是", "就", "都", "又", "还", "很", "太", "也", "再", "在", "把", "被", "给",
	"着", "地", "得", "和", "与", "及", "或", "并", "而", "但", "让", "向", "按", "将", "个", "这", "那", "每", "各",
	"一个", "这个", "那个", "一种", "一些", "已经", "如果", "因为", "所以", "然后"
]);

function hasCjkCharacter(value) {
	return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(String(value || ""));
}

function hasHanCharacter(value) {
	return /\p{Script=Han}/u.test(String(value || ""));
}

function splitSimilaritySegments(value) {
	return String(value || "").match(/[\p{Script=Han}]+|[\p{L}\p{N}\p{M}_]+/gu) || [];
}

function getSimilaritySegmenter(value) {
	if (hasHanCharacter(value) && similarityChineseWordSegmenter) {
		return similarityChineseWordSegmenter;
	}

	return similarityWordSegmenter;
}

function expandSimilarityToken(token) {
	const normalized = normalizeSimilarityText(token);
	if (!normalized) {
		return [];
	}

	if (!hasHanCharacter(normalized)) {
		return [normalized];
	}

	const chars = Array.from(normalized);
	const expanded = new Set([normalized]);
	const maxGramSize = Math.min(chars.length, 3);
	for (let size = 2; size <= maxGramSize; size += 1) {
		for (let index = 0; index <= chars.length - size; index += 1) {
			expanded.add(chars.slice(index, index + size).join(""));
		}
	}

	return Array.from(expanded);
}

function shouldKeepSimilarityToken(token) {
	const normalized = normalizeSimilarityText(token);
	if (!normalized) {
		return false;
	}

	if (SIMILARITY_CHINESE_STOP_TOKENS.has(normalized)) {
		return false;
	}

	if (hasHanCharacter(normalized)) {
		return true;
	}

	return normalized.length > 1;
}

function tokenizeForSimilarity(value) {
	const normalized = normalizeSimilarityText(value);
	if (!normalized) {
		return [];
	}

	const tokens = [];
	const segmenter = getSimilaritySegmenter(normalized);
	if (segmenter) {
		for (const part of segmenter.segment(normalized)) {
			const rawSegment = normalizeSimilarityText(part.segment);
			if (!rawSegment) {
				continue;
			}

			const segments = splitSimilaritySegments(rawSegment);
			segments.forEach((segment) => {
				const isWordLike = part.isWordLike === true;
				const shouldTreatAsWord = isWordLike || /[\p{L}\p{N}\p{M}_]/u.test(segment) || hasHanCharacter(segment);
				if (!shouldTreatAsWord) {
					return;
				}

				tokens.push(...expandSimilarityToken(segment));
			});
		}
	} else {
		const matches = splitSimilaritySegments(normalized);
		matches.forEach((match) => {
			tokens.push(...expandSimilarityToken(match));
		});
	}

	return Array.from(new Set(tokens.filter(shouldKeepSimilarityToken)));
}

function getCharacterBigrams(value) {
	const text = normalizeSimilarityText(value);
	const chars = Array.from(text);
	if (chars.length < 2) {
		return new Set(chars.length ? [text] : []);
	}

	const grams = new Set();
	for (let index = 0; index < chars.length - 1; index += 1) {
		grams.add(`${chars[index]}${chars[index + 1]}`);
	}
	return grams;
}

function calculatePromptSimilarity(query, candidate) {
	const queryText = normalizeSimilarityText(query);
	const candidateText = normalizeSimilarityText(candidate);
	if (!queryText || !candidateText) {
		return 0;
	}

	let score = 0;
	// Direct containment is the strongest signal for prompt reuse, so it gets a fixed boost
	// plus a small length-sensitive bonus when the query covers a large part of the candidate.
	if (candidateText.includes(queryText)) {
		const lengthBoost = Math.min(queryText.length / Math.max(candidateText.length, 1), 0.45);
		score += 0.45 + lengthBoost;
	}

	const queryTokens = new Set(tokenizeForSimilarity(queryText));
	const candidateTokens = new Set(tokenizeForSimilarity(candidateText));
	if (queryTokens.size && candidateTokens.size) {
		let overlap = 0;
		queryTokens.forEach((token) => {
			if (candidateTokens.has(token)) {
				overlap += 1;
			}
		});

		// Token overlap works like a weighted Jaccard score on normalized word sets,
		// which helps capture semantic similarity even when wording order changes.
		const union = new Set([...queryTokens, ...candidateTokens]).size;
		if (union) {
			score += (overlap / union) * 0.9;
		}
	}

	const queryBigrams = getCharacterBigrams(queryText);
	const candidateBigrams = getCharacterBigrams(candidateText);
	if (queryBigrams.size && candidateBigrams.size) {
		let overlap = 0;
		queryBigrams.forEach((gram) => {
			if (candidateBigrams.has(gram)) {
				overlap += 1;
			}
		});

		// Character bigrams add fuzzy matching for small edits, typos, and partial phrasing.
		const dice = (2 * overlap) / (queryBigrams.size + candidateBigrams.size);
		score += dice * 0.55;
	}

	return score;
}

const MIN_PROMPT_SIMILARITY_SCORE = 0.32;

function isWeakPromptMatch(query, candidate) {
	const queryText = normalizeSimilarityText(query);
	const candidateText = normalizeSimilarityText(candidate);
	if (!queryText || !candidateText) {
		return true;
	}

	// Allow direct substring matches immediately even if the overall score is modest.
	if (candidateText.includes(queryText)) {
		return false;
	}

	const queryTokens = new Set(tokenizeForSimilarity(queryText));
	const candidateTokens = new Set(tokenizeForSimilarity(candidateText));
	let tokenOverlap = 0;
	queryTokens.forEach((token) => {
		if (candidateTokens.has(token)) {
			tokenOverlap += 1;
		}
	});

	if (tokenOverlap > 0) {
		return false;
	}

	const queryBigrams = getCharacterBigrams(queryText);
	const candidateBigrams = getCharacterBigrams(candidateText);
	if (!queryBigrams.size || !candidateBigrams.size) {
		return true;
	}

	let bigramOverlap = 0;
	queryBigrams.forEach((gram) => {
		if (candidateBigrams.has(gram)) {
			bigramOverlap += 1;
		}
	});

	const dice = (2 * bigramOverlap) / (queryBigrams.size + candidateBigrams.size);
	// If there is no substring match and no shared tokens, require a minimum amount of
	// character-level overlap so accidental top-5 results do not appear in the popup.
	return dice < 0.16;
}

function findTopSimilarHistoricalPrompts(query, limit = 5) {
	const trimmedQuery = String(query || "").trim();
	if (!trimmedQuery) {
		return [];
	}

	const dedupedByText = new Map();
	sessions.forEach((session) => {
		if (!session || !Array.isArray(session.messages)) {
			return;
		}

		session.messages.forEach((message) => {
			if (!message || message.role !== "user") {
				return;
			}

			const text = String(message.text || "").trim();
			if (!text) {
				return;
			}

			const key = normalizeSimilarityText(text);
			const score = calculatePromptSimilarity(trimmedQuery, text);
				// The popup should prefer fewer high-quality suggestions over filling five slots
				// with weakly related history entries.
			if (score < MIN_PROMPT_SIMILARITY_SCORE || isWeakPromptMatch(trimmedQuery, text)) {
				return;
			}

			const previous = dedupedByText.get(key);
			if (!previous || score > previous.score || (score === previous.score && (message.timestamp || 0) > (previous.timestamp || 0))) {
				dedupedByText.set(key, {
					sessionId: session.id,
					sessionName: session.name,
					messageId: message.id,
					text,
					timestamp: message.timestamp || 0,
					score
				});
			}
		});
	});

	return Array.from(dedupedByText.values())
		.sort((a, b) => {
			if (b.score !== a.score) {
				return b.score - a.score;
			}
			return (b.timestamp || 0) - (a.timestamp || 0);
		})
		.slice(0, Math.max(1, limit));
}

function hidePromptSuggestionPopup() {
	promptSuggestions = [];
	activePromptSuggestionIndex = -1;
	if (promptSuggestionPopupEl) {
		promptSuggestionPopupEl.hidden = true;
		promptSuggestionPopupEl.innerHTML = "";
	}
}

function closeInputMoreActionsMenu() {
	if (inputMoreActionsMenuEl instanceof HTMLElement) {
		inputMoreActionsMenuEl.hidden = true;
	}
	if (inputMoreActionsBtnEl instanceof HTMLElement) {
		inputMoreActionsBtnEl.setAttribute("aria-expanded", "false");
	}
}

function updatePromptSuggestionsMenuItemState() {
	if (togglePromptSuggestionsMenuLabelEl) {
		togglePromptSuggestionsMenuLabelEl.textContent = isPromptSuggestionDisabled
			? "Enable Prompt Suggestions"
			: "Disable Prompt Suggestions";
	}
	if (togglePromptSuggestionsMenuItemEl) {
		togglePromptSuggestionsMenuItemEl.setAttribute("aria-pressed", isPromptSuggestionDisabled ? "true" : "false");
		togglePromptSuggestionsMenuItemEl.setAttribute(
			"title",
			isPromptSuggestionDisabled ? "Enable Prompt Suggestions" : "Disable Prompt Suggestions"
		);
		togglePromptSuggestionsMenuItemEl.setAttribute(
			"aria-label",
			isPromptSuggestionDisabled ? "Enable Prompt Suggestions" : "Disable Prompt Suggestions"
		);
	}
	if (togglePromptSuggestionsMenuIconEl) {
		togglePromptSuggestionsMenuIconEl.classList.toggle("is-disabled", isPromptSuggestionDisabled);
		togglePromptSuggestionsMenuIconEl.classList.toggle("is-enabled", !isPromptSuggestionDisabled);
	}
}

function setPromptSuggestionDisabled(disabled) {
	isPromptSuggestionDisabled = Boolean(disabled);
	localStorage.setItem(INPUT_MORE_ACTIONS_PROMPT_SUGGESTION_KEY, isPromptSuggestionDisabled ? "1" : "0");
	updatePromptSuggestionsMenuItemState();
	if (isPromptSuggestionDisabled) {
		hidePromptSuggestionPopup();
	} else if (promptInputEl && document.activeElement === promptInputEl) {
		renderPromptSuggestions(promptInputEl.value);
	}
}

function applyPromptSuggestion(index) {
	if (!promptInputEl || !promptSuggestions.length) {
		return;
	}

	const suggestion = promptSuggestions[index];
	if (!suggestion) {
		return;
	}

	promptInputEl.value = suggestion.text;
	promptInputEl.setSelectionRange(promptInputEl.value.length, promptInputEl.value.length);
	promptInputEl.focus();
	if (promptHistoryIndex !== -1) {
		promptHistoryIndex = -1;
		promptHistoryDraft = promptInputEl.value;
	}
	hidePromptSuggestionPopup();
	updateInputActionStates();
}

function moveActivePromptSuggestion(direction) {
	if (!promptSuggestions.length || !promptSuggestionPopupEl) {
		return false;
	}

	const nextIndex = activePromptSuggestionIndex < 0
		? (direction > 0 ? 0 : promptSuggestions.length - 1)
		: (activePromptSuggestionIndex + direction + promptSuggestions.length) % promptSuggestions.length;
	activePromptSuggestionIndex = nextIndex;

	const optionEls = promptSuggestionPopupEl.querySelectorAll(".prompt-suggestion-item");
	optionEls.forEach((optionEl, optionIndex) => {
		const isActive = optionIndex === activePromptSuggestionIndex;
		optionEl.classList.toggle("is-active", isActive);
		optionEl.setAttribute("aria-selected", isActive ? "true" : "false");
		if (isActive) {
			optionEl.scrollIntoView({ block: "nearest" });
		}
	});

	return true;
}

function renderPromptSuggestions(query) {
	if (!promptSuggestionPopupEl || !promptInputEl) {
		return;
	}

	if (isPromptSuggestionDisabled) {
		hidePromptSuggestionPopup();
		return;
	}

	const trimmedQuery = String(query || "").trim();
	if (!trimmedQuery) {
		hidePromptSuggestionPopup();
		return;
	}

	promptSuggestions = findTopSimilarHistoricalPrompts(trimmedQuery, 5);
	activePromptSuggestionIndex = -1;
	if (!promptSuggestions.length) {
		hidePromptSuggestionPopup();
		return;
	}

	promptSuggestionPopupEl.innerHTML = promptSuggestions
		.map((suggestion, index) => {
			const safeText = escapeHtml(suggestion.text);
			const sessionLabel = escapeHtml(String(suggestion.sessionName || "Session"));
			const timeLabel = formatDateTime(suggestion.timestamp || Date.now());
			const safeTime = escapeHtml(timeLabel);
			return `
				<button class="prompt-suggestion-item" type="button" role="option" aria-selected="false" data-index="${index}">
					<span class="prompt-suggestion-text">${safeText}</span>
					<span class="prompt-suggestion-meta">${sessionLabel} · ${safeTime}</span>
				</button>
			`;
		})
		.join("");
	promptSuggestionPopupEl.hidden = false;
}

function isPromptSuggestionPopupVisible() {
	return Boolean(
		promptSuggestionPopupEl
		&& !promptSuggestionPopupEl.hidden
		&& promptSuggestions.length
	);
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
			updateInputActionStates();
			return true;
		}
	}

	const nextValue = newestFirst[promptHistoryIndex] || promptHistoryDraft;
	promptInputEl.value = nextValue;
	promptInputEl.setSelectionRange(promptInputEl.value.length, promptInputEl.value.length);
	updateInputActionStates();
	return true;
}

function getPreview(session) {
	const last = session.messages[session.messages.length - 1];
	return last ? last.text : "No messages yet";
}

function sortSessionsByLatest() {
	sessions.sort((a, b) => {
		const aPinned = Boolean(a?.isPinned);
		const bPinned = Boolean(b?.isPinned);
		if (aPinned !== bPinned) {
			return Number(bPinned) - Number(aPinned);
		}

		if (hasCustomSessionOrder || aPinned) {
			return 0;
		}

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

function isPinnedSession(sessionId) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return false;
	}

	normalizeSessionState(target);
	return target.isPinned === true;
}

function canMoveSessionWithinPinnedGroup(sessionId, targetSessionId) {
	if (!sessionId || !targetSessionId) {
		return false;
	}

	return isPinnedSession(sessionId) === isPinnedSession(targetSessionId);
}

function moveSessionInList(sessionId, targetSessionId, insertAfter) {
	if (!sessionId || !targetSessionId || sessionId === targetSessionId) {
		return false;
	}

	if (!canMoveSessionWithinPinnedGroup(sessionId, targetSessionId)) {
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

function generateSessionId() {
	let nextId = "";
	do {
		nextId = `s_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
	} while (sessions.some((item) => item.id === nextId));
	return nextId;
}

async function cloneSession(sessionId) {
	const source = sessions.find((item) => item.id === sessionId);
	if (!source) {
		return;
	}

	normalizeSessionState(source);
	const sourceIndex = sessions.findIndex((item) => item.id === source.id);
	const cloned = typeof structuredClone === "function"
		? structuredClone(source)
		: JSON.parse(JSON.stringify(source));
	const baseName = String(source.name || "Session").trim() || "Session";
	const defaultCloneName = `${baseName}-clone`;
	const promptedName = window.prompt("Clone Session Name", defaultCloneName);
	if (promptedName === null) {
		return;
	}
	const clonedName = promptedName.trim() || defaultCloneName;

	cloned.id = generateSessionId();
	cloned.name = clonedName;

	if (sourceIndex >= 0) {
		sessions.splice(sourceIndex + 1, 0, cloned);
	} else {
		sessions.unshift(cloned);
	}
	activeSessionId = cloned.id;
	resetPromptHistoryNavigation();
	renderAll();
	saveState();

	if (typeof window.cloneChatContext === "function") {
		try {
			await window.cloneChatContext({
				sourceSessionId: source.id,
				targetSessionId: cloned.id
			});
		} catch {
			// Backend sync is best-effort; clone in UI remains valid even if sync fails.
		}
	}
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

function toggleSessionPinned(sessionId) {
	const targetIndex = sessions.findIndex((item) => item.id === sessionId);
	if (targetIndex < 0) {
		return;
	}

	const target = sessions[targetIndex];
	normalizeSessionState(target);
	target.isPinned = !target.isPinned;

	if (target.isPinned) {
		sessions.splice(targetIndex, 1);
		sessions.unshift(target);
	}

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
			const isPinned = Boolean(session.isPinned);
			const isAppSearchMatch = appSearchMatchedSessionIdSet.has(session.id);
			const currentAppSearchSessionId = appSearchCurrentMatchIdx >= 0 ? appSearchMatchedSessionIds[appSearchCurrentMatchIdx] : "";
			const appSearchMatchClass = isAppSearchMatch ? "session-item-app-match" : "";
			const appSearchCurrentClass = isAppSearchMatch && currentAppSearchSessionId === session.id ? "session-item-app-match-current" : "";
			const summaryNoticeClass = summaryNoticeSessionId && summaryNoticeSessionId === session.id && session.id !== activeSessionId
				? "session-item-summary-notice"
				: "";
			const itemClass = ["session-item", activeClass, appSearchMatchClass, appSearchCurrentClass, summaryNoticeClass].filter(Boolean).join(" ");
			const isOpen = session.isOpen !== false;
			const isLocked = !isOpen;
			const pinTitle = isPinned ? "Unpin session" : "Pin session";
			const lockTitle = isOpen ? "Lock session" : "Unlock session";
			const pinGlyph = "📌";
			const lockGlyph = isOpen ? "🔓︎": "🔐︎";
			const moreTitle = "More Actions";
			const safeName = escapeHtml(session.name);
			const iconText = escapeHtml(session.name.slice(0, 1).toUpperCase() || "S");
			const previewText = getPreview(session).replace(/\s+/g, " ").trim();
			const safePreview = escapeHtml(previewText);
			const sessionMenuId = `sessionActionMenu_${session.id}`;

			return `
				<li class="${itemClass}" data-id="${session.id}" role="button" tabindex="0" aria-label="Open ${safeName}" draggable="true">
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
							<button class="action-btn pin${isPinned ? " is-active" : ""}" type="button" data-action="toggle-pin" data-id="${session.id}" aria-label="${pinTitle}" aria-pressed="${isPinned ? "true" : "false"}" title="${pinTitle}">
								<span class="session-menu-glyph" aria-hidden="true">${pinGlyph}</span>
							</button>
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
								<button class="copilot-share-menu-item action-btn clone" type="button" data-action="clone" data-id="${session.id}" role="menuitem" aria-label="Clone Session">
									<span class="copilot-share-menu-item-icon session-menu-glyph" aria-hidden="true">⧉</span>
									<span class="copilot-share-menu-item-text">Clone Session</span>
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
	if (lastSearchQuery) {
		applyMessageSearchFromQuery(
			lastSearchQuery,
			{
				caseSensitive: lastSearchCaseSensitive,
				useRegex: lastSearchRegex,
				useWholeWord: lastSearchWholeWord
			},
			{ scrollToActive: currentMatchIdx >= 0 }
		);
	}
}

function renderAll({ preserveMessageScroll = false } = {}) {
	renderSessionList();
	renderMessages({ preserveScroll: preserveMessageScroll });
	renderSessionSummaryPage();
	if (typeof window.syncModelPickerForActiveSession === "function") {
		window.syncModelPickerForActiveSession();
	}
	updateInputActionStates();
	if (appSearchBarEl && !appSearchBarEl.hidden) {
		refreshAppSearch();
	}
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
		dialogTitleSummaryBtnEl.disabled = !hasActiveSession;
		dialogTitleSummaryBtnEl.setAttribute("aria-expanded", isSessionSummaryPageOpen ? "true" : "false");
		const isSummarizingCurrentSession = dialogHeaderSummarizeBusy
			&& Boolean(active)
			&& active.id === dialogHeaderSummarizeBusySessionId;
		if (isSummarizingCurrentSession) {
			dialogTitleSummaryBtnEl.title = "Summarizing in progress...";
			dialogTitleSummaryBtnEl.setAttribute("aria-label", "Summarizing in progress...");
		} else if (isSessionSummaryPageOpen) {
			dialogTitleSummaryBtnEl.title = "Back to Session";
			dialogTitleSummaryBtnEl.setAttribute("aria-label", "Back to Session");
		} else if (!hasSummary) {
			dialogTitleSummaryBtnEl.title = "Open Session Summary";
			dialogTitleSummaryBtnEl.setAttribute("aria-label", "Open Session Summary");
		} else {
			dialogTitleSummaryBtnEl.title = "Open Session Summary";
			dialogTitleSummaryBtnEl.setAttribute("aria-label", "Open Session Summary");
		}
		syncSummaryNoticeHighlightState();
	}
	if (sessionSummaryDetachBtnEl) {
		sessionSummaryDetachBtnEl.disabled = !hasActiveSession;
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
	updateFullscreenButtonState();
	if (dialogHeaderMenuBtnEl) {
		dialogHeaderMenuBtnEl.disabled = !hasActiveSession;
		if (dialogHeaderMenuBtnEl.disabled && dialogHeaderMenuEl) {
			dialogHeaderMenuEl.hidden = true;
			dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
		}
	}
	if (dialogHeaderSearchBtnEl) {
		dialogHeaderSearchBtnEl.disabled = !hasActiveSession;
		if (dialogHeaderSearchBtnEl.disabled && appSearchScope === APP_SEARCH_SCOPE_CURRENT && appSearchBarEl && !appSearchBarEl.hidden) {
			closeAppSearchBar({ restoreTriggerFocus: false });
		}
	}
	if (appSearchBtnEl) {
		const hasAnySession = sessions.length > 0;
		appSearchBtnEl.disabled = !hasAnySession;
		if (appSearchBtnEl.disabled && appSearchBarEl && !appSearchBarEl.hidden) {
			closeAppSearchBar();
		}
	}
	updateAppSearchScopeButton();
	if (sendBtnEl) {
		const hasPromptText = Boolean(promptInputEl && promptInputEl.value.trim());
		sendBtnEl.disabled = !hasActiveSession || isLocked || promptPolisherBusy || (!hasInFlightStream && !hasPromptText);
		sendBtnEl.textContent = hasInFlightStream && !isLocked ? "Cancel" : "Send";
		sendBtnEl.classList.toggle("is-cancel", hasInFlightStream);
		sendBtnEl.classList.toggle("is-streaming", hasInFlightStream);
	}
	if (promptPolisherBtnEl) {
		const hasPromptText = Boolean(promptInputEl && promptInputEl.value.trim());
		const isBusy = promptPolisherBusy;
		promptPolisherBtnEl.disabled = !hasActiveSession || isLocked || hasInFlightStream || !hasPromptText || isBusy;
		promptPolisherBtnEl.classList.toggle("is-busy", isBusy);
		promptPolisherBtnEl.setAttribute("aria-busy", isBusy ? "true" : "false");
		promptPolisherBtnEl.setAttribute("title", isBusy ? "Polishing Prompt..." : "Polish Prompt");
	}
	if (originalPromptBtnEl) {
		const active = getActiveSession();
		const hasPromptText = Boolean(promptInputEl && promptInputEl.value.trim());
		const hasStoredOriginalPrompt = Boolean(typeof active?.lastOriginalPrompt === "string" && active.lastOriginalPrompt.trim());
		const hasCompletedPromptPolish = Boolean(active?.hasCompletedPromptPolish);
		originalPromptBtnEl.disabled = !hasActiveSession || isLocked || hasInFlightStream || promptPolisherBusy || !hasPromptText || !hasStoredOriginalPrompt || !hasCompletedPromptPolish;
		originalPromptBtnEl.setAttribute("title", hasCompletedPromptPolish && hasStoredOriginalPrompt ? "Copy Raw Prompt" : "Available after prompt polish finishes");
	}
	if (inputMoreActionsBtnEl) {
		inputMoreActionsBtnEl.disabled = !hasActiveSession;
		if (inputMoreActionsBtnEl.disabled) {
			closeInputMoreActionsMenu();
		}
	}
	if (togglePromptSuggestionsMenuItemEl) {
		togglePromptSuggestionsMenuItemEl.disabled = !hasActiveSession || isLocked;
	}
	updatePromptSuggestionsMenuItemState();
	if (promptInputEl) {
		promptInputEl.disabled = !hasActiveSession || isLocked || hasInFlightStream || promptPolisherBusy;
		promptInputEl.placeholder = hasInFlightStream
			? "Response is streaming. Press Cancel to stop."
			: promptPolisherBusy
				? "Polishing prompt..."
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

function getFullscreenElement() {
	return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function canUseFullscreenApi() {
	const rootEl = document.documentElement;
	return Boolean(
		(rootEl && (rootEl.requestFullscreen || rootEl.webkitRequestFullscreen))
		&& (document.exitFullscreen || document.webkitExitFullscreen)
	);
}

function updateFullscreenButtonState() {
	const fullscreenButtons = [dialogHeaderFullscreenBtnEl, dialogHeaderFullscreenBtn2El].filter((buttonEl) => buttonEl instanceof HTMLButtonElement);
	if (!fullscreenButtons.length) {
		return;
	}

	if (!canUseFullscreenApi()) {
		for (const fullscreenButtonEl of fullscreenButtons) {
			fullscreenButtonEl.disabled = true;
			fullscreenButtonEl.classList.remove("is-fullscreen");
			fullscreenButtonEl.title = "Full Screen not supported";
			fullscreenButtonEl.setAttribute("aria-label", "Full Screen not supported");
			const buttonTextEl = fullscreenButtonEl.querySelector(".copilot-share-menu-item-text");
			if (buttonTextEl) {
				buttonTextEl.textContent = "Full Screen not supported";
			}
		}
		return;
	}

	const isFullscreen = Boolean(getFullscreenElement());
	for (const fullscreenButtonEl of fullscreenButtons) {
		fullscreenButtonEl.disabled = false;
		fullscreenButtonEl.classList.toggle("is-fullscreen", isFullscreen);
		fullscreenButtonEl.title = isFullscreen ? "Exit Full Screen" : "Enter Full Screen";
		fullscreenButtonEl.setAttribute("aria-label", isFullscreen ? "Exit Full Screen" : "Enter Full Screen");
		const buttonTextEl = fullscreenButtonEl.querySelector(".copilot-share-menu-item-text");
		if (buttonTextEl) {
			buttonTextEl.textContent = isFullscreen ? "Exit Full Screen" : "Enter Full Screen";
		}
	}
}

async function requestFullscreenMode() {
	const rootEl = appEl || document.documentElement;
	if (!rootEl) {
		return;
	}

	if (typeof rootEl.requestFullscreen === "function") {
		await rootEl.requestFullscreen();
		return;
	}

	if (typeof rootEl.webkitRequestFullscreen === "function") {
		rootEl.webkitRequestFullscreen();
	}
}

async function exitFullscreenMode() {
	if (typeof document.exitFullscreen === "function") {
		await document.exitFullscreen();
		return;
	}

	if (typeof document.webkitExitFullscreen === "function") {
		document.webkitExitFullscreen();
	}
}

async function toggleFullscreenMode() {
	if (!canUseFullscreenApi()) {
		return;
	}

	try {
		if (getFullscreenElement()) {
			await exitFullscreenMode();
		} else {
			await requestFullscreenMode();
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		window.alert(`Fullscreen failed: ${message}`);
	} finally {
		updateFullscreenButtonState();
	}
}

async function registerServiceWorker() {
	if (!("serviceWorker" in navigator)) {
		return;
	}

	if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
		return;
	}

	try {
		await navigator.serviceWorker.register("./pwa/sw.js", { scope: "./" });
	} catch (error) {
		console.warn("Service worker registration failed:", error);
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
function openSession(sessionId, fromListClick = false, options = {}) {
	const target = sessions.find((item) => item.id === sessionId);
	if (!target) {
		return;
	}
	activeSessionId = target.id;
	closeSessionSummaryPage();
	resetPromptHistoryNavigation();
	renderAll();
	saveState();

	if (options && options.appSearchQuery) {
		applySessionSearchFromAppQuery(options.appSearchQuery, {
			...(options.appSearchOptions || {})
		});
	}

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
	hidePromptSuggestionPopup();
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

async function polishPromptInput() {
	if (!promptInputEl || isActiveSessionLocked() || isActiveSessionStreamInFlight() || promptPolisherBusy) {
		return;
	}

	const active = getActiveSession();
	if (!active) {
		return;
	}

	const promptText = promptInputEl.value.trim();
	if (!promptText) {
		return;
	}

	if (typeof window.polishUserPrompt !== "function") {
		window.alert("Prompt polisher API is not available.");
		return;
	}

	promptPolisherBusy = true;
	updateInputActionStates();

	try {
		const modelId = modelSelectEl ? String(modelSelectEl.value || "").trim() : "";
		const result = await window.polishUserPrompt({
			sessionId: active.id,
			prompt: promptText,
			modelId
		});

		const polishedPrompt = String(result?.polishedPrompt || "").trim();
		if (!polishedPrompt) {
			window.alert("Prompt polisher returned an empty prompt.");
			return;
		}

		active.lastOriginalPrompt = promptText;
		active.hasCompletedPromptPolish = true;

		promptInputEl.value = polishedPrompt;
		promptInputEl.setSelectionRange(promptInputEl.value.length, promptInputEl.value.length);
		renderPromptSuggestions(promptInputEl.value);
		promptInputEl.focus();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		window.alert(`Prompt polish failed: ${message}`);
	} finally {
		promptPolisherBusy = false;
		updateInputActionStates();
	}
}

async function copyOriginalPromptToClipboard() {
	if (!promptInputEl || isActiveSessionLocked() || isActiveSessionStreamInFlight() || promptPolisherBusy) {
		return;
	}

	const active = getActiveSession();
	if (!active) {
		return;
	}
	if (!active.hasCompletedPromptPolish) {
		return;
	}

	const originalPrompt = typeof active.lastOriginalPrompt === "string" ? active.lastOriginalPrompt : "";
	if (!originalPrompt.trim()) {
		return;
	}

	try {
		await copyTextToClipboard(originalPrompt);
		showOriginalPromptCopyFeedback();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		window.alert(`Copy raw prompt failed: ${message}`);
	}
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
		if (action === "toggle-pin") {
			toggleSessionPinned(sessionId);
			closeAllSessionActionMenus();
			return;
		}
		if (action === "rename") {
			renameSession(sessionId);
			closeAllSessionActionMenus();
			return;
		}
		if (action === "clone") {
			void cloneSession(sessionId);
			closeAllSessionActionMenus();
			return;
		}
		if (action === "delete") {
			deleteSession(sessionId);
			closeAllSessionActionMenus();
			return;
	 	}
		if (action !== "rename" && action !== "clone" && action !== "delete") {
			return;
		}
		return;
	}

	const item = target.closest(".session-item");
	if (!item) {
		return;
	}
	openSession(item.dataset.id, true, getOpenSessionOptionsForAppSearchMatch(item));
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

	const target = event.target;
	if (!(target instanceof HTMLElement)) {
		clearSessionDropMarkers();
		dragDropSessionId = null;
		dragDropInsertAfter = false;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "none";
		}
		return;
	}

	const item = target.closest(".session-item");
	if (!(item instanceof HTMLElement)) {
		clearSessionDropMarkers();
		dragDropSessionId = null;
		dragDropInsertAfter = false;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "none";
		}
		return;
	}

	const targetSessionId = item.dataset.id;
	if (!targetSessionId || targetSessionId === draggingSessionId) {
		clearSessionDropMarkers();
		dragDropSessionId = null;
		dragDropInsertAfter = false;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "none";
		}
		return;
	}

	if (!canMoveSessionWithinPinnedGroup(draggingSessionId, targetSessionId)) {
		clearSessionDropMarkers();
		dragDropSessionId = null;
		dragDropInsertAfter = false;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "none";
		}
		return;
	}

	event.preventDefault();

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
	if (event.target instanceof Element && (event.target.closest("button") || event.target.closest("[role='menuitem']"))) {
		return;
	}
	const item = event.target.closest(".session-item");
	if (!item) {
		return;
	}
	event.preventDefault();
	openSession(item.dataset.id, true, getOpenSessionOptionsForAppSearchMatch(item));
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

	if (action === "retry") {
		const sourceMessage = records[0];
		if (sourceMessage && sourceMessage.role === "user" && promptInputEl instanceof HTMLTextAreaElement) {
			promptInputEl.value = String(sourceMessage.text || "");
			promptInputEl.focus();
			promptInputEl.setSelectionRange(promptInputEl.value.length, promptInputEl.value.length);
			updateInputActionStates();
		}
	}

	if (action === "delete") {
		deleteMessageRecords(sessionId, records);
	}

	hideMessageContextMenu();
});

sendBtnEl.addEventListener("click", handlePrimaryActionClick);

if (promptPolisherBtnEl) {
	promptPolisherBtnEl.addEventListener("click", () => {
		void polishPromptInput();
	});
}

if (originalPromptBtnEl) {
	originalPromptBtnEl.addEventListener("click", () => {
		void copyOriginalPromptToClipboard();
	});
}

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
			if (dialogHeaderMenuEl && dialogHeaderMenuBtnEl) {
				dialogHeaderMenuEl.hidden = true;
				dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
			}
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

if (dialogHeaderFullscreenBtnEl) {
	dialogHeaderFullscreenBtnEl.addEventListener("click", () => {
		void toggleFullscreenMode();
	});
}

if (dialogHeaderFullscreenBtn2El) {
	dialogHeaderFullscreenBtn2El.addEventListener("click", () => {
		if (dialogHeaderMenuEl && dialogHeaderMenuBtnEl) {
			dialogHeaderMenuEl.hidden = true;
			dialogHeaderMenuBtnEl.setAttribute("aria-expanded", "false");
		}
		void toggleFullscreenMode();
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
		const summarySessionId = active.id;

		dialogHeaderSummarizeBusy = true;
		dialogHeaderSummarizeBusySessionId = summarySessionId;
		dialogHeaderSummarizeBtnEl.classList.add("is-busy");
		dialogHeaderSummarizeBtnEl.setAttribute("aria-busy", "true");
		updateInputActionStates();

		const originalTitle = dialogHeaderSummarizeBtnEl.getAttribute("title") || "Summarize Session Messages";
		dialogHeaderSummarizeBtnEl.setAttribute("title", "Summarizing...");

		try {
			const modelId = typeof active.modelId === "string" ? active.modelId.trim() : "";
			const result = await window.summarizeSessionMessages({
				sessionId: summarySessionId,
				summarySource,
				modelId
			});
			const targetSession = sessions.find((session) => session.id === summarySessionId);
			if (!targetSession) {
				return;
			}

			targetSession.summaryMarkdown = buildSessionSummaryMarkdown(result.reply, {
				sessionName: targetSession.name,
				sessionId: targetSession.id
			});
			saveState();
			renderSessionSummaryPage();
			showSummaryNoticeFeedback(summarySessionId);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			window.alert(`Summarize failed: ${message}`);
		} finally {
			dialogHeaderSummarizeBtnEl.setAttribute("title", originalTitle);
			dialogHeaderSummarizeBtnEl.classList.remove("is-busy");
			dialogHeaderSummarizeBtnEl.setAttribute("aria-busy", "false");
			dialogHeaderSummarizeBusy = false;
			dialogHeaderSummarizeBusySessionId = "";
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

		if (
			inputMoreActionsMenuEl
			&& inputMoreActionsBtnEl
			&& !inputMoreActionsMenuEl.contains(e.target)
			&& e.target !== inputMoreActionsBtnEl
		) {
			closeInputMoreActionsMenu();
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

if (inputMoreActionsBtnEl && inputMoreActionsMenuEl) {
	inputMoreActionsBtnEl.addEventListener("click", (event) => {
		if (inputMoreActionsBtnEl.disabled) {
			closeInputMoreActionsMenu();
			return;
		}

		event.stopPropagation();
		const expanded = inputMoreActionsBtnEl.getAttribute("aria-expanded") === "true";
		if (expanded) {
			closeInputMoreActionsMenu();
			return;
		}

		inputMoreActionsMenuEl.hidden = false;
		inputMoreActionsBtnEl.setAttribute("aria-expanded", "true");
		requestMenuPopupClamp();
	});
}

if (togglePromptSuggestionsMenuItemEl) {
	togglePromptSuggestionsMenuItemEl.addEventListener("click", () => {
		if (togglePromptSuggestionsMenuItemEl.disabled) {
			return;
		}

		setPromptSuggestionDisabled(!isPromptSuggestionDisabled);
		closeInputMoreActionsMenu();
	});
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
			const handled = isPromptSuggestionPopupVisible()
				? moveActivePromptSuggestion(direction)
				: navigatePromptHistoryByWheel(direction);
			if (handled) {
				event.preventDefault();
				return;
			}
		}
	}

	if (!event.altKey && !event.ctrlKey && !event.metaKey) {
		if (event.key === "Escape" && promptSuggestions.length) {
			hidePromptSuggestionPopup();
			event.preventDefault();
			return;
		}

		if (event.key === "Enter" && !event.shiftKey && promptSuggestions.length && activePromptSuggestionIndex >= 0) {
			event.preventDefault();
			applyPromptSuggestion(activePromptSuggestionIndex);
			return;
		}
	}

	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		hidePromptSuggestionPopup();
		handlePrimaryActionClick();
	}
});

promptInputEl.addEventListener("input", () => {
	if (promptHistoryIndex !== -1) {
		promptHistoryIndex = -1;
		promptHistoryDraft = promptInputEl.value;
	}
	if (isPromptSuggestionDisabled) {
		hidePromptSuggestionPopup();
	} else {
		renderPromptSuggestions(promptInputEl.value);
	}
	updateInputActionStates();
			updateInputActionStates();
});

promptInputEl.addEventListener("wheel", (event) => {
	if (document.activeElement !== promptInputEl) {
		return;
	}

	updateInputActionStates();
	const direction = event.deltaY < 0 ? -1 : event.deltaY > 0 ? 1 : 0;
	if (!direction) {
		return;
	}

	const handled = isPromptSuggestionPopupVisible()
		? moveActivePromptSuggestion(direction)
		: navigatePromptHistoryByWheel(direction);
	if (handled) {
		event.preventDefault();
	}
}, { passive: false });

if (inputHintMenuEl) {
	document.addEventListener("click", (event) => {
		closeInputHintMenuIfNeeded(event.target);
	});
}

if (promptSuggestionPopupEl) {
	promptSuggestionPopupEl.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}

		const button = target.closest(".prompt-suggestion-item");
		if (!(button instanceof HTMLButtonElement)) {
			return;
		}

		const index = Number(button.dataset.index);
		if (Number.isFinite(index)) {
			applyPromptSuggestion(index);
		}
	});
}

document.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof Element)) {
		return;
	}

	const insidePromptArea = target.closest("#promptInput") || target.closest("#promptSuggestionPopup");
	if (!insidePromptArea) {
		hidePromptSuggestionPopup();
	}

	if (
		inputMoreActionsMenuEl
		&& inputMoreActionsBtnEl
		&& !target.closest("#inputMoreActionsBtn")
		&& !target.closest("#inputMoreActionsMenu")
	) {
		closeInputMoreActionsMenu();
	}
});

mobileBackBtnEl.addEventListener("click", () => {
	appEl.classList.remove("show-dialog");
});

window.addEventListener("resize", () => {
	if (!window.matchMedia("(max-width: 760px)").matches) {
		appEl.classList.remove("show-dialog");
	}
	applySidebarState();
	clampInputAreaHeight();
	applyAppSearchFloatingPosition();
	hideSessionHoverPopup();
	hideMessageContextMenu();
	requestMenuPopupClamp();
});

window.addEventListener("scroll", hideSessionHoverPopup, { passive: true });
window.addEventListener("scroll", hideMessageContextMenu, { passive: true });
document.addEventListener("fullscreenchange", updateFullscreenButtonState);
document.addEventListener("webkitfullscreenchange", updateFullscreenButtonState);

if (sidebarToggleBtnEl) {
	sidebarToggleBtnEl.addEventListener("click", toggleSidebarCollapse);
}

// ====== Bootstrapping ======
initializeInputAreaResize();
loadState();
updatePromptSuggestionsMenuItemState();
if (!sessions.length) {
	createSession("New Session");
}
if (typeof window.initCopilotSharePanel === "function") {
	void window.initCopilotSharePanel();
}
applySidebarState();
renderAll();
updateFullscreenButtonState();
void registerServiceWorker();
