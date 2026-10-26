import { STATUSES, type Status } from "../types.ts";

export function statusCounts(
	overrides: Partial<Record<Status, number>> = {},
	total?: number,
): Record<string, number> {
	const counts: Record<string, number> = {};

	for (const status of STATUSES) {
		counts[status] = overrides[status] ?? 0;
	}

	if (total !== undefined) {
		counts.total = total;
	}

	return counts;
}
