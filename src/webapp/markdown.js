let markdownConfigured = false;

function escapeHtmlForMarkdown(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
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

function renderAgentMarkdown(text) {
	const source = String(text || "");

	if (!window.marked || !window.DOMPurify) {
		return escapeHtmlForMarkdown(source);
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

window.renderAgentMarkdown = renderAgentMarkdown;
window.enhanceMarkdownContent = enhanceMarkdownContent;
window.applyMarkdownCodeHighlight = applyMarkdownCodeHighlight;
