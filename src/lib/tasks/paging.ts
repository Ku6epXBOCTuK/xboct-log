export const TASK_PAGE_SIZE = 20;

export function pageCount(total: number, pageSize = TASK_PAGE_SIZE): number {
	return Math.max(1, Math.ceil(total / pageSize));
}
