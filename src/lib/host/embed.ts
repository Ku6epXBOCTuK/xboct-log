export function isEmbedded(): boolean {
	return window.parent !== window;
}

export function openExternal(url: string): void {
	if (isEmbedded()) {
		window.parent.postMessage({ type: "xboct-log:open-external", url }, "*");
		return;
	}

	window.open(url, "_blank", "noopener");
}

export function openRepoFile(
	repo: string,
	path: string,
	fallbackUrl: string,
): void {
	if (isEmbedded()) {
		window.parent.postMessage({ type: "xboct-log:open-file", repo, path }, "*");
		return;
	}

	window.open(fallbackUrl, "_blank", "noopener");
}

export function openMedia(url: string): void {
	const absolute = new URL(url, location.href).href;

	if (isEmbedded()) {
		window.parent.postMessage(
			{ type: "xboct-log:open-media", url: absolute },
			"*",
		);
		return;
	}

	window.open(absolute, "_blank", "noopener");
}
