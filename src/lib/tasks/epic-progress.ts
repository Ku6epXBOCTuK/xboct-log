import { CLOSED_STATUSES, type EpicSummary } from "#lib/types.ts";

export interface EpicProgress {
	closed: number;
	total: number;
}

export type ChildrenCounts = Record<string, number>;

export function epicProgress(
	counts: ChildrenCounts | null | undefined,
): EpicProgress | null {
	if (counts === undefined || counts === null) return null;

	return {
		closed: CLOSED_STATUSES.reduce(
			(sum, status) => sum + (counts[status] ?? 0),
			0,
		),
		total: counts.total ?? 0,
	};
}

export function openChildren(epic: EpicSummary): number {
	const progress = epicProgress(epic.children_counts);
	if (progress === null) return 0;
	return progress.total - progress.closed;
}
