// NOTE: crypto.randomUUID throws outside a secure context, and the tracker is
// reachable over plain http on the LAN, so fall back to raw random bytes.
function randomId(): string {
	const uuid = globalThis.crypto?.randomUUID?.();
	if (uuid !== undefined) {
		return uuid;
	}
	const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

export const CLIENT_ID = randomId();
