import {
	ACTIVE_STATUSES,
	STATUSES,
	type Project,
	type Scope,
	type Task,
} from "#lib/types.ts";

export type StatusCounts = Record<string, number>;

export function emptyCounts(): StatusCounts {
	return Object.fromEntries(STATUSES.map((status) => [status, 0]));
}

export function activeCount(counts: StatusCounts | undefined): number {
	if (counts === undefined) return 0;

	return ACTIVE_STATUSES.reduce(
		(sum, status) => sum + (counts[status] ?? 0),
		0,
	);
}

export function totalCount(counts: StatusCounts | undefined): number {
	if (counts === undefined) return 0;

	return STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

export function epicActive(epics: Task[]): number {
	return epics.filter((epic) => ACTIVE_STATUSES.includes(epic.status)).length;
}

export function projectActive(project: Project): number {
	return activeCount(project.task_counts) + activeCount(project.epic_counts);
}

export function projectTotal(project: Project): number {
	return totalCount(project.task_counts) + totalCount(project.epic_counts);
}

export function scopeActive(scope: Scope): number {
	return scope.task_count ?? 0;
}

export function scopeTotal(scope: Scope): number {
	return scope.tasks_total ?? scope.task_count ?? 0;
}
