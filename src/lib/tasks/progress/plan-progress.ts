import { CLOSED_STATUSES, type Task } from "#lib/types.ts";

export interface PlanProgress {
	closed: number;
	total: number;
}

export function planProgress(tasks: readonly Task[]): PlanProgress {
	const counted = tasks.filter(
		(task) => !task.is_epic && task.deleted_at == null,
	);
	return {
		closed: counted.filter((task) => CLOSED_STATUSES.includes(task.status))
			.length,
		total: counted.length,
	};
}
