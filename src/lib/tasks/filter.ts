import { CLOSED_STATUSES, type Task } from "#lib/types.ts";

export interface TagCount {
	tag: string;
	count: number;
	active: number;
}

export interface EpicProgress {
	closed: number;
	total: number;
}

export function collectEpicProgress(tasks: Task[]): Map<string, EpicProgress> {
	const progress = new Map<string, EpicProgress>();

	for (const task of tasks) {
		if (task.epic_id === null) continue;

		const entry = progress.get(task.epic_id);

		if (entry === undefined) {
			progress.set(task.epic_id, {
				closed: CLOSED_STATUSES.includes(task.status) ? 1 : 0,
				total: 1,
			});
			continue;
		}

		entry.total += 1;
		if (CLOSED_STATUSES.includes(task.status)) entry.closed += 1;
	}

	return progress;
}
