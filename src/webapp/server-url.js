function initServerUrlPanel() {
	const serverUrlBoxEl = document.getElementById("serverUrlBox");
	const serverUrlMenuBtnEl = document.getElementById("serverUrlMenuBtn");
	const serverUrlMenuEl = document.getElementById("serverUrlMenu");
	const copyServerLanMenuItemEl = document.getElementById("copyServerLanMenuItem");
	const openServerLanMenuItemEl = document.getElementById("openServerLanMenuItem");
	const copyServerLanMenuLabelEl = document.getElementById("copyServerLanMenuLabel");
	const openServerLanMenuLabelEl = document.getElementById("openServerLanMenuLabel");
	const serverLanUrlValueEl = document.getElementById("serverLanUrlValue");
	const serverLocalUrlValueEl = document.getElementById("serverLocalUrlValue");

	if (!serverUrlBoxEl || !serverUrlMenuBtnEl || !serverUrlMenuEl || !copyServerLanMenuItemEl || !openServerLanMenuItemEl || !copyServerLanMenuLabelEl || !openServerLanMenuLabelEl) {
		return Promise.resolve();
	}

	let currentLanServerUrl = "";

	function setMenuLabel(labelEl, value) {
		labelEl.textContent = value;
	}

	function updateMenuActionState() {
		const hasLanUrl = Boolean(String(currentLanServerUrl || "").trim());
		copyServerLanMenuItemEl.disabled = !hasLanUrl;
		setMenuLabel(copyServerLanMenuLabelEl, "Copy Public URL");
		copyServerLanMenuItemEl.title = hasLanUrl ? "Copy public URL" : "Public URL unavailable";

		openServerLanMenuItemEl.disabled = !hasLanUrl;
		setMenuLabel(openServerLanMenuLabelEl, "Open Public URL");
		openServerLanMenuItemEl.title = hasLanUrl ? "Open public URL" : "Public URL unavailable";
	}

	function closeMenu() {
		serverUrlMenuEl.hidden = true;
		serverUrlMenuBtnEl.setAttribute("aria-expanded", "false");
	}

	function toggleMenu() {
		const shouldOpen = serverUrlMenuEl.hidden;
		serverUrlMenuEl.hidden = !shouldOpen;
		serverUrlMenuBtnEl.setAttribute("aria-expanded", String(shouldOpen));
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
			if (serverLanUrlValueEl) {
				serverLanUrlValueEl.textContent = lanUrl || "Not available";
			}
			if (serverLocalUrlValueEl) {
				serverLocalUrlValueEl.textContent = localUrl;
			}
			updateMenuActionState();
		} catch {
			currentLanServerUrl = "";
			if (serverLanUrlValueEl) {
				serverLanUrlValueEl.textContent = "Not available";
			}
			if (serverLocalUrlValueEl) {
				serverLocalUrlValueEl.textContent = `${window.location.origin}`;
			}
			updateMenuActionState();
		}
	}

	serverUrlMenuBtnEl.addEventListener("click", () => {
		toggleMenu();
	});

	copyServerLanMenuItemEl.addEventListener("click", async () => {
		const copyBtnName = "Copy Public URL";
		const copyTarget = String(currentLanServerUrl || "").trim();
		if (!copyTarget) {
			return;
		}

		try {
			await navigator.clipboard.writeText(copyTarget);
			setMenuLabel(copyServerLanMenuLabelEl, "Copied");
			window.setTimeout(() => {
				setMenuLabel(copyServerLanMenuLabelEl, copyBtnName);
			}, 1200);
		} catch {
			setMenuLabel(copyServerLanMenuLabelEl, "Failed");
			window.setTimeout(() => {
				setMenuLabel(copyServerLanMenuLabelEl, copyBtnName);
			}, 1200);
		}

		closeMenu();
	});

	openServerLanMenuItemEl.addEventListener("click", () => {
		const openBtnName = "Open Public URL";
		const targetUrl = String(currentLanServerUrl || "").trim();
		if (!targetUrl) {
			return;
		}

		const openedWindow = window.open(targetUrl, "_blank", "noopener,noreferrer");
		if (openedWindow) {
			setMenuLabel(openServerLanMenuLabelEl, "Opened");
		} else {
			setMenuLabel(openServerLanMenuLabelEl, "Blocked");
		}
		window.setTimeout(() => {
			setMenuLabel(openServerLanMenuLabelEl, openBtnName);
		}, 1200);

		closeMenu();
	});

	document.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof Node)) {
			return;
		}
		if (serverUrlBoxEl.contains(target)) {
			return;
		}
		closeMenu();
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeMenu();
			serverUrlMenuBtnEl.focus();
		}
	});

	updateMenuActionState();
	closeMenu();
	return loadServerUrlInfo();
}

window.initServerUrlPanel = initServerUrlPanel;
