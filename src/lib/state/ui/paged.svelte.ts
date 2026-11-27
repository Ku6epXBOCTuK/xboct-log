import { data } from "#lib/data/data.svelte.ts";

export interface PagedResult<T> {
	items: T[];
	total: number;
	offset?: number;
	size?: number;
	page_size?: number;
}

export function createPagedQuery<T>(
	key: string,
	fetchPage: (cursor: number) => Promise<PagedResult<T>>,
	fallbackPageSize: number,
) {
	let cursor = $state(0);
	let offset = $state(0);
	let size = $state(0);
	let pageSize = $state(fallbackPageSize);
	const items = data.cell<T[]>(`${key}:items`, []);
	const total = data.cell(`${key}:total`, 0);
	let failed = $state(false);
	let loaded = $state(false);

	async function load(nextCursor: number): Promise<void> {
		cursor = nextCursor;
		try {
			await data.load(
				`${key}:page:${nextCursor}`,
				() => fetchPage(nextCursor),
				(result) => {
					items.set(result.items);
					total.set(result.total);
					offset = result.offset ?? nextCursor;
					size = result.size ?? result.items.length;
					pageSize = result.page_size ?? fallbackPageSize;
					failed = false;
					loaded = true;
				},
				true,
			);
		} catch {
			failed = true;
		}
	}

	return {
		load,
		get cursor() {
			return cursor;
		},
		get offset() {
			return offset;
		},
		get size() {
			return size;
		},
		get pageSize() {
			return pageSize;
		},
		get items() {
			return items.value;
		},
		get total() {
			return total.value;
		},
		get failed() {
			return failed;
		},
		get loaded() {
			return loaded;
		},
	};
}
