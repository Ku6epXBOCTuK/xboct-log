export interface PagedResult<T> {
	items: T[];
	total: number;
}

export function createPagedQuery<T>(
	fetchPage: (offset: number) => Promise<PagedResult<T>>,
) {
	let offset = $state(0);
	let items = $state<T[]>([]);
	let total = $state(0);
	let failed = $state(false);
	let loaded = $state(false);
	let requestId = 0;

	async function load(nextOffset: number): Promise<void> {
		const current = ++requestId;
		offset = nextOffset;
		try {
			const result = await fetchPage(nextOffset);
			if (current !== requestId) return;
			items = result.items;
			total = result.total;
			failed = false;
			loaded = true;
		} catch {
			if (current !== requestId) return;
			failed = true;
		}
	}

	return {
		load,
		get offset() {
			return offset;
		},
		get items() {
			return items;
		},
		get total() {
			return total;
		},
		get failed() {
			return failed;
		},
		get loaded() {
			return loaded;
		},
	};
}
