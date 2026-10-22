const STORAGE_KEY = "xboct-log.advanced";

export function createUiStore() {
	let advanced = $state(false);

	$effect(() => {
		if (window.localStorage.getItem(STORAGE_KEY) === "1") advanced = true;
	});

	function set(value: boolean) {
		advanced = value;
		window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
	}

	return {
		get advanced() {
			return advanced;
		},
		set,
		toggle() {
			set(!advanced);
		},
	};
}

export type UiStore = ReturnType<typeof createUiStore>;
