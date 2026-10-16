export type ThemeName = "light" | "dark";

export function createTheme(initial: ThemeName | null = null) {
	let override = $state<ThemeName | null>(initial);
	let systemLight = $state(false);

	$effect(() => {
		const media = window.matchMedia("(prefers-color-scheme: light)");
		const sync = () => (systemLight = media.matches);

		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	});

	// NOTE: message shape is shared with the xboct-log VS Code extension wrapper.
	$effect(() => {
		const onMessage = (event: MessageEvent) => {
			const data = event.data as { type?: string; theme?: unknown } | null;
			if (data?.type !== "xboct-log:theme") return;
			if (data.theme !== "light" && data.theme !== "dark") return;
			override = data.theme;
		};

		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	});

	const appearance = $derived(override ?? (systemLight ? "light" : "dark"));
	const themeClass = $derived(override === null ? "" : `theme-${override}`);

	return {
		get appearance() {
			return appearance;
		},
		get themeClass() {
			return themeClass;
		},
		set(theme: ThemeName | null) {
			override = theme;
		},
		toggle() {
			override = appearance === "light" ? "dark" : "light";
		},
	};
}

export type Theme = ReturnType<typeof createTheme>;
