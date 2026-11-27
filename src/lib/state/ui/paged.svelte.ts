import { data } from "#lib/data/data.svelte.ts";

export interface PagedResult<T> {
	items: T[];
	total: number;
}

export function createPagedQuery<T>(
	key: string,
	fetchPage: (offset: number) => Promise<PagedResult<T>>,
) {
	let offset = $state(0);
	const items = data.cell<T[]>(`${key}:items`, []);
	const total = data.cell(`${key}:total`, 0);
	let failed = $state(false);
	let loaded = $state(false);

	async function load(nextOffset: number): Promise<void> {
		offset = nextOffset;
		try {
			await data.load(
				`${key}:page:${nextOffset}`,
				() => fetchPage(nextOffset),
				(result) => {
					items.set(result.items);
					total.set(result.total);
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
		get offset() {
			return offset;
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
