export function reloadApp(): void {
	if (window.parent !== window) {
		window.parent.postMessage({ type: "xboct-log:reload" }, "*");
		return;
	}

	window.location.reload();
}
