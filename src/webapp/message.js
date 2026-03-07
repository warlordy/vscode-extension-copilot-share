window.onUserSend = async ({ sessionId, text }) => {
	const SLOW_REQUEST_MS = 3000;
	let hasFinalResponse = false;
	const slowFallbackTimer = window.setTimeout(() => {
		if (hasFinalResponse) {
			return;
		}

		window.appendAgentMessage(sessionId, 'Copilot is typing...');
	}, SLOW_REQUEST_MS);

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

		hasFinalResponse = true;
		window.clearTimeout(slowFallbackTimer);
		window.appendAgentMessage(sessionId, replyText);
	} catch (error) {
		hasFinalResponse = true;
		window.clearTimeout(slowFallbackTimer);
		const message = error instanceof Error ? error.message : String(error);
		window.appendAgentMessage(sessionId, `Request failed: ${message}`);
	}
};