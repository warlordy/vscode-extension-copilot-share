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
		const message = error instanceof Error ? error.message : String(error);
		window.appendAgentMessage(sessionId, `Request failed: ${message}`);
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