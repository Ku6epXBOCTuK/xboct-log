export interface HotkeyEvent {
	key: string;
	code?: string;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	metaKey: boolean;
}

const CODE_BY_SYMBOL: Record<string, string> = {
	"/": "Slash",
	".": "Period",
	",": "Comma",
	";": "Semicolon",
	"[": "BracketLeft",
	"]": "BracketRight",
	"-": "Minus",
	"=": "Equal",
	"'": "Quote",
	"`": "Backquote",
	"\\": "Backslash",
};

function codeFor(key: string): string | undefined {
	if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
	return CODE_BY_SYMBOL[key];
}

export function isTypingTarget(target: EventTarget | null): boolean {
	if (target === null || typeof target !== "object") return false;
	const element = target as { tagName?: string; isContentEditable?: boolean };
	if (element.isContentEditable) return true;
	const tag = (element.tagName ?? "").toUpperCase();
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function matchesHotkey(event: HotkeyEvent, combo: string): boolean {
	const parts = combo
		.toLowerCase()
		.split("+")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	if (parts.length === 0) return false;

	const key = parts[parts.length - 1];
	const modifiers = parts.slice(0, -1);
	const wants = (name: string) => modifiers.includes(name);

	if (event.ctrlKey !== wants("ctrl")) return false;
	if (event.altKey !== wants("alt")) return false;
	if (event.shiftKey !== wants("shift")) return false;
	if (event.metaKey !== wants("meta")) return false;

	if (event.key.toLowerCase() === key) return true;

	const code = codeFor(key);
	return code !== undefined && event.code === code;
}
