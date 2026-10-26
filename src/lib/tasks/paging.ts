export const TASK_PAGE_SIZE = 20;

export function pageCount(total: number, pageSize = TASK_PAGE_SIZE): number {
	return Math.max(1, Math.ceil(total / pageSize));
}

export type PageItem = number | "gap";

export function pageItems(
	current: number,
	last: number,
	siblings = 1,
): PageItem[] {
	const shown = new Set<number>([1, last]);
	for (let page = current - siblings; page <= current + siblings; page += 1) {
		if (page >= 1 && page <= last) shown.add(page);
	}

	const sorted = [...shown].sort((a, b) => a - b);
	const items: PageItem[] = [];
	let previous = 0;
	for (const page of sorted) {
		if (previous !== 0) {
			const missing = page - previous - 1;
			if (missing === 1) {
				items.push(previous + 1);
			} else if (missing > 1) {
				items.push("gap");
			}
		}
		items.push(page);
		previous = page;
	}
	return items;
}
