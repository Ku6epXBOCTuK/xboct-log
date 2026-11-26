import { DEFAULT_PINNED, NAV_IDS, type NavId } from "#lib/navigation/ids.ts";

const ADVANCED_KEY = "xboct-log.advanced";
const NAV_KEY = "xboct-log.navigation";
const NAV_VERSION = 1;

interface NavState {
	navCollapsed: boolean;
	pinned: NavId[];
}

function isNavId(value: unknown): value is NavId {
	return (
		typeof value === "string" && (NAV_IDS as readonly string[]).includes(value)
	);
}

function loadNavState(): NavState {
	const fallback: NavState = {
		navCollapsed: true,
		pinned: [...DEFAULT_PINNED],
	};
	const raw = window.localStorage.getItem(NAV_KEY);
	if (raw === null) return fallback;

	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null) return fallback;
		const record = value as Record<string, unknown>;
		if (record.version !== NAV_VERSION) return fallback;
		return {
			navCollapsed: record.navCollapsed === true,
			pinned: Array.isArray(record.pinned)
				? record.pinned.filter(isNavId)
				: [...DEFAULT_PINNED],
		};
	} catch {
		return fallback;
	}
}

export function createUiStore() {
	const saved = loadNavState();

	let advanced = $state(window.localStorage.getItem(ADVANCED_KEY) === "1");
	let navCollapsed = $state(saved.navCollapsed);
	let pinned = $state<NavId[]>(saved.pinned);

	function set(value: boolean) {
		advanced = value;
		window.localStorage.setItem(ADVANCED_KEY, value ? "1" : "0");
	}

	function saveNav() {
		window.localStorage.setItem(
			NAV_KEY,
			JSON.stringify({ version: NAV_VERSION, navCollapsed, pinned }),
		);
	}

	function setNavCollapsed(value: boolean) {
		navCollapsed = value;
		saveNav();
	}

	function togglePin(id: NavId) {
		pinned = pinned.includes(id)
			? pinned.filter((item) => item !== id)
			: [...pinned, id];
		saveNav();
	}

	return {
		get advanced() {
			return advanced;
		},
		set,
		toggle() {
			set(!advanced);
		},
		get navCollapsed() {
			return navCollapsed;
		},
		setNavCollapsed,
		get pinned() {
			return pinned;
		},
		isPinned(id: NavId) {
			return pinned.includes(id);
		},
		togglePin,
	};
}

export type UiStore = ReturnType<typeof createUiStore>;
