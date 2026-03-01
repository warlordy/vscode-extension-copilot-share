# LLM Session Dialog Web UI (High-Level Summary)

This page is a single-file web chat interface for **user ↔ LLM/Agent** conversations, with local session/message persistence and simple integration hooks for your backend logic.

## 1) User Features

- **Session management (left panel)**
	- Create a new session
	- Rename a session
	- Delete a session
	- Select an active session
- **Conversation experience (right panel)**
	- View message history per session (user and agent bubbles)
	- Send user prompts with `Enter` (and multiline via `Shift+Enter`)
	- See a temporary **“LLM is typing...”** placeholder row
- **Persistence**
	- Sessions and message history are saved in `localStorage`
	- Last active session is restored on reload
- **Responsive behavior**
	- Desktop: two-column layout
	- Mobile: session list and dialog switch views with a back button

## 2) Layout Structure

- **Root container**: `.app`
	- Two-column grid: left sidebar + right dialog panel
- **Left column (sessions)**
	- Header with title + **+ New** button
	- Session count
	- Scrollable session list (`.session-list`) with independent scroll
- **Right column (dialog)**
	- Dialog header (session title/subtitle)
	- Scrollable messages area (`.messages`) with independent scroll
	- Fixed input area (`.input-area`) that remains visible while messages grow

## 3) Developer Callback Contract

The page exposes a minimal callback pattern so you can plug in your own request/response pipeline:

### A. Outbound hook (you implement)

Define this function in your own script:

```js
window.onUserSend = async ({ sessionId, text }) => {
	// 1) send request to your backend/LLM service
	// 2) parse response
	// 3) call window.appendAgentMessage(sessionId, parsedText)
};
```

`onUserSend` is called automatically after the UI adds the user message.

### B. Inbound helper (already provided by page)

Use this to append model replies:

```js
window.appendAgentMessage(sessionId, text);
```

What it does:
- Adds an agent message into the target session
- Clears typing indicator for that session
- Re-renders UI
- Persists to `localStorage`

## 4) Data Model (Simplified)

- **Session**
	- `id: string`
	- `name: string`
	- `messages: Message[]`
- **Message**
	- `id: string`
	- `role: "user" | "agent"`
	- `text: string`
	- `timestamp: number`

## 5) Local Storage Keys

- `llm-dialog-sessions-v1`: serialized session list with all messages
- `llm-dialog-active-session`: currently selected session id

## 6) Quick Integration Example

Paste this snippet after the page script (or in another script loaded after `index.html`).

```js
window.onUserSend = async ({ sessionId, text }) => {
	try {
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				sessionId,
				message: text
			})
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		// Example expected shape: { reply: "..." }
		const data = await response.json();
		const replyText = typeof data.reply === 'string' ? data.reply : 'No response text returned.';

		window.appendAgentMessage(sessionId, replyText);
	} catch (error) {
		window.appendAgentMessage(sessionId, `Request failed: ${error.message}`);
	}
};
```

If your backend returns a different field name (for example `content` or `answer`), map that field to `replyText` before calling `window.appendAgentMessage(...)`.

## 7) Quick Integration Example (Streaming via Chunked Fetch)

Use this when your backend streams partial text chunks (for example plain text chunks or NDJSON-style content). This example buffers chunks and appends one final agent message when streaming finishes.

```js
window.onUserSend = async ({ sessionId, text }) => {
	try {
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				sessionId,
				message: text,
				stream: true
			})
		});

		if (!response.ok || !response.body) {
			throw new Error(`HTTP ${response.status}`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder('utf-8');
		let fullText = '';

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value, { stream: true });
			fullText += chunk;
		}

		fullText += decoder.decode();
		const replyText = fullText.trim() || 'No streamed content returned.';

		window.appendAgentMessage(sessionId, replyText);
	} catch (error) {
		window.appendAgentMessage(sessionId, `Streaming failed: ${error.message}`);
	}
};
```

Notes:
- If your stream format is JSON lines, parse each chunk before appending to `fullText`.
- Your current UI helper (`window.appendAgentMessage`) appends a complete message once; if you want live token-by-token rendering, add an incremental update helper in the page script.

