export function createTheme() {
	let override = $state<"light" | "dark" | null>(null);
	let systemLight = $state(false);

	$effect(() => {
		const media = window.matchMedia("(prefers-color-scheme: light)");
		const sync = () => (systemLight = media.matches);

		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
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
		toggle() {
			override = appearance === "light" ? "dark" : "light";
		},
	};
}

export type Theme = ReturnType<typeof createTheme>;
