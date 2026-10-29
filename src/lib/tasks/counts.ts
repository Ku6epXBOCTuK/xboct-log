import {
	ACTIVE_STATUSES,
	STATUSES,
	type Project,
	type Scope,
	type Task,
} from "#lib/types.ts";

export type StatusCounts = Record<string, number>;

export interface CountGroups {
	backlog: number;
	active: number;
	blocked: number;
	complete: number;
}

export function emptyCounts(): StatusCounts {
	return Object.fromEntries(STATUSES.map((status) => [status, 0]));
}

function mergeCounts(...sources: (StatusCounts | undefined)[]): StatusCounts {
	const merged: StatusCounts = {};

	for (const source of sources) {
		for (const [status, count] of Object.entries(source ?? {})) {
			merged[status] = (merged[status] ?? 0) + count;
		}
	}

	return merged;
}

function groupsOf(counts: StatusCounts): CountGroups {
	return {
		backlog: counts.backlog ?? 0,
		active: (counts.open ?? 0) + (counts["in-progress"] ?? 0),
		blocked: counts.blocked ?? 0,
		complete: counts.done ?? 0,
	};
}

export function projectCounts(project: Project): CountGroups {
	return groupsOf(mergeCounts(project.task_counts, project.epic_counts));
}

export function summarize(
	counts: StatusCounts | undefined,
	epics: Task[],
): CountGroups {
	const fromEpics: StatusCounts = {};

	for (const epic of epics) {
		fromEpics[epic.status] = (fromEpics[epic.status] ?? 0) + 1;
	}

	return groupsOf(mergeCounts(counts, fromEpics));
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
