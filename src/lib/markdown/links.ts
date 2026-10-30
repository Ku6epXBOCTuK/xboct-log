export type LinkKind = "external" | "media" | "ignore";

export function classifyLink(href: string, base: string): LinkKind {
	const value = href.trim();
	if (value === "") return "ignore";

	let url: URL;
	try {
		url = new URL(value, base);
	} catch {
		return "ignore";
	}

	if (url.protocol === "mailto:") return "external";
	if (url.protocol !== "http:" && url.protocol !== "https:") return "ignore";
	if (url.origin !== new URL(base).origin) return "external";

	return url.pathname.startsWith("/media/") ? "media" : "ignore";
}
