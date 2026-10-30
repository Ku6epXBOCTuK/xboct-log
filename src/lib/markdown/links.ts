export type LinkKind = "external" | "media" | "file" | "ignore";

export function classifyLink(href: string, base: string): LinkKind {
	const value = href.trim();
	if (value === "" || value.startsWith("#")) return "ignore";

	let url: URL;
	try {
		url = new URL(value, base);
	} catch {
		return "ignore";
	}

	if (url.protocol === "mailto:") return "external";
	if (url.protocol !== "http:" && url.protocol !== "https:") return "ignore";

	const baseUrl = new URL(base);
	if (url.origin !== baseUrl.origin) return "external";
	if (url.pathname.startsWith("/media/")) return "media";
	if (url.pathname === baseUrl.pathname && url.search === baseUrl.search) {
		return "ignore";
	}

	return "file";
}

export function repoPath(href: string): string | null {
	const value = href.trim();
	if (value === "" || value.startsWith("#")) return null;

	const withoutQuery = value.split(/[?#]/)[0];
	let segments: string[];
	try {
		segments = withoutQuery
			.split("/")
			.map((segment) => decodeURIComponent(segment));
	} catch {
		return null;
	}

	const path = segments.filter((segment) => segment !== "" && segment !== ".");
	if (path.length === 0) return null;
	if (path.some((segment) => segment === "..")) return null;
	if (path.some((segment) => segment.includes("\\") || segment.includes(":"))) {
		return null;
	}

	return path.join("/");
}
