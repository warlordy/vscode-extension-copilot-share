function initServerUrlPanel() {
	const serverUrlBoxEl = document.getElementById("serverUrlBox");
	const serverUrlToggleBtnEl = document.getElementById("serverUrlToggleBtn");
	const serverLanUrlValueEl = document.getElementById("serverLanUrlValue");
	const serverLocalUrlValueEl = document.getElementById("serverLocalUrlValue");
	const copyServerUrlBtnEl = document.getElementById("copyServerUrlBtn");

	if (!serverUrlBoxEl || !serverUrlToggleBtnEl || !serverLanUrlValueEl || !serverLocalUrlValueEl || !copyServerUrlBtnEl) {
		return Promise.resolve();
	}

	let currentLanServerUrl = "";

	function updateCopyServerUrlButtonState() {
		const hasLanUrl = Boolean(String(currentLanServerUrl || "").trim());
		copyServerUrlBtnEl.disabled = !hasLanUrl;
		copyServerUrlBtnEl.textContent = "Copy LAN URL";
		copyServerUrlBtnEl.title = hasLanUrl ? "Copy LAN URL" : "LAN URL unavailable";
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
			updateCopyServerUrlButtonState();
		} catch {
			currentLanServerUrl = "";
			serverLanUrlValueEl.textContent = "Not available";
			serverLocalUrlValueEl.textContent = `${window.location.origin}`;
			updateCopyServerUrlButtonState();
		}
	}

	copyServerUrlBtnEl.addEventListener("click", async () => {
		const copyBtnName = "Copy LAN URL";
		const copyTarget = String(currentLanServerUrl || "").trim();
		if (!copyTarget) {
			return;
		}

		try {
			await navigator.clipboard.writeText(copyTarget);
			copyServerUrlBtnEl.textContent = "Copied";
			window.setTimeout(() => {
				copyServerUrlBtnEl.textContent = copyBtnName;
			}, 1200);
		} catch {
			copyServerUrlBtnEl.textContent = "Failed";
			window.setTimeout(() => {
				copyServerUrlBtnEl.textContent = copyBtnName;
			}, 1200);
		}
	});

	serverUrlToggleBtnEl.addEventListener("click", () => {
		const isCollapsed = serverUrlBoxEl.classList.contains("collapsed");
		serverUrlBoxEl.classList.toggle("collapsed", !isCollapsed);
		serverUrlToggleBtnEl.setAttribute("aria-expanded", String(isCollapsed));
	});

	updateCopyServerUrlButtonState();
	return loadServerUrlInfo();
}

window.initServerUrlPanel = initServerUrlPanel;
