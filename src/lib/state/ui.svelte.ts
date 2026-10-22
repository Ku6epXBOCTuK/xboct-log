const ADVANCED_KEY = "xboct-log.advanced";
const SIDEBAR_KEY = "xboct-log.sidebar";

export function createUiStore() {
	let advanced = $state(false);
	let sidebarHidden = $state(false);

	$effect(() => {
		if (window.localStorage.getItem(ADVANCED_KEY) === "1") advanced = true;
		if (window.localStorage.getItem(SIDEBAR_KEY) === "1") sidebarHidden = true;
	});

	function set(value: boolean) {
		advanced = value;
		window.localStorage.setItem(ADVANCED_KEY, value ? "1" : "0");
	}

	function setSidebarHidden(value: boolean) {
		sidebarHidden = value;
		window.localStorage.setItem(SIDEBAR_KEY, value ? "1" : "0");
	}

	return {
		get advanced() {
			return advanced;
		},
		set,
		toggle() {
			set(!advanced);
		},
		get sidebarHidden() {
			return sidebarHidden;
		},
		setSidebarHidden,
		toggleSidebar() {
			setSidebarHidden(!sidebarHidden);
		},
	};
}

export type UiStore = ReturnType<typeof createUiStore>;
