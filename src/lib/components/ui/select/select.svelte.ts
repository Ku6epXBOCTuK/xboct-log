export interface SelectConfig<T> {
	items: () => T[];
	getLabel: (item: T) => string;
	getKeywords?: (item: T) => string;
	onPick: (item: T) => void;
	onOpen?: () => void;
	onClose?: () => void;
}

function matches<T>(
	item: T,
	needle: string,
	getLabel: (item: T) => string,
	getKeywords?: (item: T) => string,
): boolean {
	if (needle === "") return true;
	const haystack =
		`${getLabel(item)} ${getKeywords?.(item) ?? ""}`.toLowerCase();
	return haystack.includes(needle);
}

export function createSelect<T>(config: SelectConfig<T>) {
	let open = $state(false);
	let query = $state("");
	let activeIndex = $state(0);

	const needle = $derived(query.trim().toLowerCase());

	const filtered = $derived(
		config
			.items()
			.filter((item) =>
				matches(item, needle, config.getLabel, config.getKeywords),
			),
	);

	const active = $derived(
		filtered.length === 0
			? null
			: (filtered[
					((activeIndex % filtered.length) + filtered.length) % filtered.length
				] ?? null),
	);

	function show() {
		if (open) return;
		open = true;
		query = "";
		activeIndex = 0;
		config.onOpen?.();
	}

	function hide() {
		if (!open) return;
		open = false;
		query = "";
		config.onClose?.();
	}

	function toggle() {
		if (open) hide();
		else show();
	}

	function setQuery(value: string) {
		query = value;
		activeIndex = 0;
	}

	function move(delta: number) {
		if (filtered.length === 0) {
			activeIndex = 0;
			return;
		}
		activeIndex =
			(((activeIndex + delta) % filtered.length) + filtered.length) %
			filtered.length;
	}

	function moveTo(index: number) {
		activeIndex = index;
	}

	function pickActive(): T | null {
		const item = active;
		if (item === null) return null;
		config.onPick(item);
		return item;
	}

	function handleKeydown(event: KeyboardEvent): boolean {
		switch (event.key) {
			case "ArrowDown":
				if (!open) show();
				else move(1);
				return true;
			case "ArrowUp":
				if (!open) show();
				else move(-1);
				return true;
			case "Home":
				if (!open) return false;
				moveTo(0);
				return true;
			case "End":
				if (!open) return false;
				moveTo(Math.max(filtered.length - 1, 0));
				return true;
			case "Enter":
				if (!open) return false;
				return pickActive() !== null;
			case "Escape":
				if (!open) return false;
				hide();
				return true;
			case "Tab":
				if (!open) return false;
				hide();
				return false;
			default:
				return false;
		}
	}

	return {
		get open() {
			return open;
		},
		get query() {
			return query;
		},
		get filtered() {
			return filtered;
		},
		get active() {
			return active;
		},
		show,
		hide,
		toggle,
		setQuery,
		move,
		moveTo,
		pickActive,
		handleKeydown,
	};
}

export type Select<T> = ReturnType<typeof createSelect<T>>;
