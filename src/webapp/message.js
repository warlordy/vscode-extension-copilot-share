let modelPickerState = {
	items: [],
	isOpen: false,
	searchQuery: ""
};
const activeStreamControllers = new Map();

function getOrCreateSessionControllerSet(sessionId) {
	const key = String(sessionId || "");
	if (!key) {
		return null;
	}

	let set = activeStreamControllers.get(key);
	if (!set) {
		set = new Set();
		activeStreamControllers.set(key, set);
	}

	return set;
}

function notifyStreamStateChanged(sessionId) {
	if (typeof window.onSessionStreamStateChanged !== "function") {
		return;
	}

	window.onSessionStreamStateChanged({
		sessionId,
		inFlight: window.isSessionStreamInFlight(sessionId)
	});
}

function attachStreamController(sessionId, controller) {
	const set = getOrCreateSessionControllerSet(sessionId);
	if (!set || !(controller instanceof AbortController)) {
		return;
	}

	set.add(controller);
	notifyStreamStateChanged(sessionId);
}

function detachStreamController(sessionId, controller) {
	const key = String(sessionId || "");
	const set = activeStreamControllers.get(key);
	if (!set) {
		return;
	}

	set.delete(controller);
	if (set.size === 0) {
		activeStreamControllers.delete(key);
	}

	notifyStreamStateChanged(key);
}

window.isSessionStreamInFlight = function isSessionStreamInFlight(sessionId) {
	const key = String(sessionId || "");
	if (!key) {
		return false;
	}

	const set = activeStreamControllers.get(key);
	return Boolean(set && set.size > 0);
};

window.cancelUserSend = function cancelUserSend(sessionId) {
	const key = String(sessionId || "");
	if (!key) {
		return false;
	}

	const set = activeStreamControllers.get(key);
	if (!set || set.size === 0) {
		return false;
	}

	for (const controller of Array.from(set)) {
		controller.abort();
	}

	return true;
};

function getModelName(model) {
	const rawName = typeof model?.name === "string" ? model.name.trim() : "";
	return rawName || "Model";
}

function isAutoModel(item) {
	const combined = `${item.name} ${item.id}`.toLowerCase();
	return combined.includes("auto");
}

function getDefaultModelId(items) {
	const autoItem = items.find((item) => isAutoModel(item));
	if (autoItem) {
		return autoItem.id;
	}
	return items[0]?.id || "";
}

function readActiveSessionModelId() {
	if (typeof window.getActiveSessionModelId !== "function") {
		return "";
	}

	const modelId = window.getActiveSessionModelId();
	return typeof modelId === "string" ? modelId.trim() : "";
}

function writeActiveSessionModelId(modelId) {
	if (typeof window.setActiveSessionModelId !== "function") {
		return;
	}
	window.setActiveSessionModelId(modelId);
}

function setModelPickerSelection(selectedId) {
	const triggerNameEl = document.getElementById("modelPickerName");
	const popupEl = document.getElementById("modelPickerPopup");
	const selectEl = document.getElementById("modelSelect");
	if (!(triggerNameEl instanceof HTMLElement) || !(popupEl instanceof HTMLElement)) {
		return;
	}

	const selectedItem = modelPickerState.items.find((item) => item.id === selectedId) || modelPickerState.items[0];
	if (!selectedItem) {
		triggerNameEl.textContent = "No models";
		return;
	}

	triggerNameEl.textContent = selectedItem.name;

	if (selectEl instanceof HTMLSelectElement) {
		selectEl.value = selectedItem.id;
	}

	for (const element of popupEl.querySelectorAll(".model-picker-item")) {
		if (!(element instanceof HTMLButtonElement)) {
			continue;
		}
		element.classList.toggle("selected", element.dataset.id === selectedItem.id);
	}
}

function getFilteredModelGroups(query) {
	const searchText = String(query || "").trim().toLowerCase();
	const filtered = searchText
		? modelPickerState.items.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(searchText))
		: modelPickerState.items.slice();

	const autoModels = filtered.filter((item) => isAutoModel(item));
	const otherModels = filtered
		.filter((item) => !isAutoModel(item))
		.sort((a, b) => {
			const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
			if (byName !== 0) {
				return byName;
			}
			return a.id.localeCompare(b.id, undefined, { sensitivity: "base" });
		});

	return { autoModels, otherModels };
}

function renderModelPickerList() {
	const popupEl = document.getElementById("modelPickerPopup");
	const selectEl = document.getElementById("modelSelect");
	if (!(popupEl instanceof HTMLElement)) {
		return;
	}

	const listEl = popupEl.querySelector(".model-picker-list");
	if (!(listEl instanceof HTMLElement)) {
		return;
	}

	listEl.innerHTML = "";
	const { autoModels, otherModels } = getFilteredModelGroups(modelPickerState.searchQuery);

	const appendGroupItems = (items) => {
		if (!items.length) {
			return;
		}

		for (const item of items) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "model-picker-item";
			button.dataset.id = item.id;

			const nameEl = document.createElement("span");
			nameEl.className = "model-picker-item-name";
			nameEl.textContent = item.name;

			button.append(nameEl);
			button.addEventListener("click", () => {
				setModelPickerSelection(item.id);
				writeActiveSessionModelId(item.id);
				closeModelPicker();
			});
			listEl.append(button);
		}
	};

	appendGroupItems(autoModels);

	if (autoModels.length && otherModels.length) {
		const separator = document.createElement("div");
		separator.className = "model-picker-separator";
		listEl.append(separator);
	}

	appendGroupItems(otherModels);

	if (!autoModels.length && !otherModels.length) {
		const empty = document.createElement("div");
		empty.className = "model-picker-empty";
		empty.textContent = modelPickerState.searchQuery ? "No matching models" : "No Copilot models";
		listEl.append(empty);
	}

	if (selectEl instanceof HTMLSelectElement && selectEl.value) {
		setModelPickerSelection(selectEl.value);
	}
}

function closeModelPicker() {
	const triggerEl = document.getElementById("modelPickerTrigger");
	const popupEl = document.getElementById("modelPickerPopup");
	if (!(triggerEl instanceof HTMLButtonElement) || !(popupEl instanceof HTMLElement)) {
		return;
	}

	modelPickerState.isOpen = false;
	modelPickerState.searchQuery = "";
	const searchInputEl = popupEl.querySelector(".model-picker-search-input");
	if (searchInputEl instanceof HTMLInputElement) {
		searchInputEl.value = "";
	}
	renderModelPickerList();
	triggerEl.setAttribute("aria-expanded", "false");
	popupEl.hidden = true;
}

function openModelPicker() {
	const triggerEl = document.getElementById("modelPickerTrigger");
	const popupEl = document.getElementById("modelPickerPopup");
	if (!(triggerEl instanceof HTMLButtonElement) || !(popupEl instanceof HTMLElement)) {
		return;
	}

	modelPickerState.isOpen = true;
	const searchInputEl = popupEl.querySelector(".model-picker-search-input");
	if (searchInputEl instanceof HTMLInputElement) {
		window.setTimeout(() => {
			searchInputEl.focus();
			searchInputEl.select();
		}, 0);
	}
	triggerEl.setAttribute("aria-expanded", "true");
	popupEl.hidden = false;
}

function renderModelPicker(models, selectedId) {
	const popupEl = document.getElementById("modelPickerPopup");
	const selectEl = document.getElementById("modelSelect");
	if (!(popupEl instanceof HTMLElement) || !(selectEl instanceof HTMLSelectElement)) {
		return;
	}

	popupEl.innerHTML = "";
	selectEl.innerHTML = "";

	const normalized = models
		.map((model) => {
			const id = typeof model?.id === "string" ? model.id : "";
			if (!id) {
				return null;
			}
			return {
				id,
				name: getModelName(model)
			};
		})
		.filter(Boolean);

	modelPickerState.items = normalized;
	modelPickerState.searchQuery = "";

	for (const item of normalized) {
		const option = document.createElement("option");
		option.value = item.id;
		option.textContent = item.name;
		selectEl.append(option);
	}

	const searchWrap = document.createElement("div");
	searchWrap.className = "model-picker-search";

	const searchInput = document.createElement("input");
	searchInput.type = "search";
	searchInput.className = "model-picker-search-input";
	searchInput.placeholder = "Search models";
	searchInput.setAttribute("aria-label", "Search models");
	searchInput.spellcheck = false;
	searchInput.autocomplete = "off";
	searchInput.addEventListener("input", () => {
		modelPickerState.searchQuery = searchInput.value;
		renderModelPickerList();
	});
	searchWrap.append(searchInput);
	popupEl.append(searchWrap);

	const searchDivider = document.createElement("div");
	searchDivider.className = "model-picker-search-divider";
	popupEl.append(searchDivider);

	const listEl = document.createElement("div");
	listEl.className = "model-picker-list";
	popupEl.append(listEl);

	renderModelPickerList();

	const initialId = selectedId && normalized.some((item) => item.id === selectedId)
		? selectedId
		: getDefaultModelId(normalized);

	if (initialId) {
		setModelPickerSelection(initialId);
	}
}

function syncModelPickerForActiveSession() {
	if (!modelPickerState.items.length) {
		return;
	}

	const sessionModelId = readActiveSessionModelId();
	const normalizedId = sessionModelId && modelPickerState.items.some((item) => item.id === sessionModelId)
		? sessionModelId
		: getDefaultModelId(modelPickerState.items);

	if (!normalizedId) {
		return;
	}

	setModelPickerSelection(normalizedId);
	if (sessionModelId !== normalizedId) {
		writeActiveSessionModelId(normalizedId);
	}
}

async function loadCopilotModels() {
	const selectEl = document.getElementById("modelSelect");
	const triggerNameEl = document.getElementById("modelPickerName");
	if (!(selectEl instanceof HTMLSelectElement) || !(triggerNameEl instanceof HTMLElement)) {
		return;
	}

	triggerNameEl.textContent = "Loading models...";
	selectEl.disabled = true;

	try {
		const response = await fetch("/api/models");
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const data = await response.json();
		const models = Array.isArray(data?.models) ? data.models : [];

		if (!models.length) {
			modelPickerState.items = [];
			triggerNameEl.textContent = "No Copilot models";
			selectEl.disabled = true;
			return;
		}

		renderModelPicker(models, readActiveSessionModelId());
		if (!modelPickerState.items.length) {
			triggerNameEl.textContent = "No Copilot models";
			selectEl.disabled = true;
			return;
		}

		selectEl.disabled = false;
		syncModelPickerForActiveSession();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		modelPickerState.items = [];
		triggerNameEl.textContent = `Models unavailable (${message})`;
		selectEl.disabled = true;
	}
}

window.syncModelPickerForActiveSession = syncModelPickerForActiveSession;

function initModelSelect() {
	const selectEl = document.getElementById("modelSelect");
	const triggerEl = document.getElementById("modelPickerTrigger");
	const popupEl = document.getElementById("modelPickerPopup");
	if (!(selectEl instanceof HTMLSelectElement) || !(triggerEl instanceof HTMLButtonElement) || !(popupEl instanceof HTMLElement)) {
		return;
	}

	triggerEl.addEventListener("click", () => {
		if (selectEl.disabled || !modelPickerState.items.length) {
			return;
		}
		if (modelPickerState.isOpen) {
			closeModelPicker();
		} else {
			openModelPicker();
		}
	});

	window.addEventListener("click", (event) => {
		if (!modelPickerState.isOpen) {
			return;
		}
		const target = event.target;
		if (!(target instanceof Node)) {
			return;
		}
		if (triggerEl.contains(target) || popupEl.contains(target)) {
			return;
		}
		closeModelPicker();
	});

	window.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && modelPickerState.isOpen) {
			closeModelPicker();
		}
	});

	void loadCopilotModels();
}

if (document.readyState === "loading") {
	window.addEventListener("DOMContentLoaded", initModelSelect);
} else {
	initModelSelect();
}

window.onUserSend = async ({ sessionId, text, modelId }) => {
	let streamMessageId = "";
	let streamedText = "";
	const controller = new AbortController();
	attachStreamController(sessionId, controller);

	try {
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal: controller.signal,
			body: JSON.stringify({
				sessionId,
				message: text,
				modelId: typeof modelId === "string" && modelId.trim() ? modelId.trim() : undefined,
				stream: true
			})
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		if (!response.body) {
			const data = await response.json();
			const replyText = typeof data.reply === 'string' ? data.reply : 'No response text returned.';
			window.appendAgentMessage(sessionId, replyText);
			return;
		}

		if (typeof window.startAgentMessageStream === "function") {
			streamMessageId = window.startAgentMessageStream(sessionId);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		const flushEventLine = (line) => {
			const trimmed = String(line || "").trim();
			if (!trimmed) {
				return;
			}

			let payload;
			try {
				payload = JSON.parse(trimmed);
			} catch {
				return;
			}

			if (payload.type === "delta") {
				const delta = typeof payload.delta === "string" ? payload.delta : "";
				if (!delta) {
					return;
				}

				streamedText += delta;
				if (streamMessageId && typeof window.updateAgentMessageStream === "function") {
					window.updateAgentMessageStream(sessionId, streamMessageId, streamedText);
				}
				return;
			}

			if (payload.type === "done") {
				const finalText = typeof payload.reply === "string" ? payload.reply : streamedText;
				if (streamMessageId && typeof window.finalizeAgentMessageStream === "function") {
					window.finalizeAgentMessageStream(sessionId, streamMessageId, finalText);
				} else {
					window.appendAgentMessage(sessionId, finalText);
				}
				return;
			}

			if (payload.type === "error") {
				const errorMessage = typeof payload.error === "string" ? payload.error : "Unknown streaming error";
				throw new Error(errorMessage);
			}
		};

		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			let newlineIndex = buffer.indexOf("\n");
			while (newlineIndex !== -1) {
				const line = buffer.slice(0, newlineIndex);
				buffer = buffer.slice(newlineIndex + 1);
				flushEventLine(line);
				newlineIndex = buffer.indexOf("\n");
			}
		}

		buffer += decoder.decode();
		if (buffer.trim()) {
			flushEventLine(buffer);
		}
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			if (streamMessageId && typeof window.finalizeAgentMessageStream === "function") {
				window.finalizeAgentMessageStream(sessionId, streamMessageId, streamedText || "Generation canceled.");
			} else if (!streamedText) {
				window.appendAgentMessage(sessionId, "Generation canceled.");
			}
			return;
		}

		const message = error instanceof Error ? error.message : String(error);
		if (streamMessageId && typeof window.finalizeAgentMessageStream === "function") {
			window.finalizeAgentMessageStream(sessionId, streamMessageId, streamedText || `Request failed: ${message}`);
			return;
		}
		window.appendAgentMessage(sessionId, `Request failed: ${message}`);
	} finally {
		detachStreamController(sessionId, controller);
	}
};

window.resetChatContext = async ({ sessionId, clearAll = false } = {}) => {
	const body = clearAll ? { clearAll: true } : { sessionId };

	const response = await fetch('/api/chat/reset', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	return response.json();
};