import { CLIENT_INFO_META_KEY } from "@modelcontextprotocol/server";

export const CLIENT_LABEL_MAX_LENGTH = 80;

export function clientLabel(envelope: unknown): string | null {
	if (typeof envelope !== "object" || envelope === null) {
		return null;
	}
	const info = (envelope as Record<string, unknown>)[CLIENT_INFO_META_KEY];
	if (typeof info !== "object" || info === null) {
		return null;
	}
	const { name, version } = info as { name?: unknown; version?: unknown };
	if (typeof name !== "string") {
		return null;
	}
	const label =
		typeof version === "string" && version !== "" ? `${name}/${version}` : name;
	return shorten(printable(label));
}

function printable(raw: string): string {
	let text = "";
	for (const char of raw) {
		const code = char.codePointAt(0) ?? 0;
		text += code < 0x20 || code === 0x7f ? " " : char;
	}
	return text.replace(/\s+/g, " ").trim();
}

function shorten(text: string): string | null {
	if (text === "") {
		return null;
	}
	return text.slice(0, CLIENT_LABEL_MAX_LENGTH);
}
