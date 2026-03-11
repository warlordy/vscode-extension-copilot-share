export const EXTENSION_ID = 'copilot-share';
const DEBUG_PREFIX = `[${EXTENSION_ID}]`;
export function debugLog(message: string): void {
	console.log(`${DEBUG_PREFIX} ${message}`);
}