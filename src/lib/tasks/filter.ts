import type { Filters } from "#lib/state/filters.svelte.ts";
import {
	CLOSED_STATUSES,
	type Priority,
	type ProjectFilter,
	type Status,
	type Task,
} from "#lib/types.ts";

export interface FilterCriteria {
	activeProject: ProjectFilter;
	status: Status | "all";
	priority: Priority | "all";
	hideClosed: boolean;
	epic: string;
	scope: "any" | "none" | number;
	selectedTags: string[];
	query: string;
}

export function projectTasks(tasks: Task[], projectId: ProjectFilter): Task[] {
	return projectId === null
		? tasks
		: tasks.filter((task) => task.project_id === projectId);
}

export function filterTasks(tasks: Task[], criteria: FilterCriteria): Task[] {
	const needle = criteria.query.trim().toLowerCase();

	return tasks.filter((task) => {
		if (
			criteria.activeProject !== null &&
			task.project_id !== criteria.activeProject
		) {
			return false;
		}
		if (criteria.status !== "all" && task.status !== criteria.status) {
			return false;
		}
		if (criteria.hideClosed && CLOSED_STATUSES.includes(task.status)) {
			return false;
		}
		if (criteria.priority !== "all" && task.priority !== criteria.priority) {
			return false;
		}
		if (criteria.epic === "none" && task.epic_id !== null) return false;
		if (
			criteria.epic !== "any" &&
			criteria.epic !== "none" &&
			task.epic_id !== criteria.epic
		) {
			return false;
		}
		if (criteria.scope === "none" && task.scope_id !== null) return false;
		if (
			criteria.scope !== "any" &&
			criteria.scope !== "none" &&
			task.scope_id !== criteria.scope
		) {
			return false;
		}
		if (
			criteria.selectedTags.length > 0 &&
			!criteria.selectedTags.some((tag) => task.tags.includes(tag))
		) {
			return false;
		}
		if (needle === "") return true;

		return (
			task.id.toLowerCase().includes(needle) ||
			task.title.toLowerCase().includes(needle) ||
			task.description.toLowerCase().includes(needle)
		);
	});
}

export interface TagCount {
	tag: string;
	count: number;
}

export function collectTags(tasks: Task[]): TagCount[] {
	const counts = new Map<string, number>();

	for (const task of tasks) {
		for (const tag of task.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}

	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((left, right) => left.tag.localeCompare(right.tag));
}

export function countTasksInProject(
	tasks: Task[],
	projectId: ProjectFilter,
): number {
	return projectTasks(tasks, projectId).length;
}

export function countActiveTasksInProject(
	tasks: Task[],
	projectId: ProjectFilter,
): number {
	return projectTasks(tasks, projectId).filter(
		(task) => !CLOSED_STATUSES.includes(task.status),
	).length;
}

export function getActiveTotal(tasks: Task[], filters: Filters): number {
	return filters.activeProject === null
		? tasks.length
		: countTasksInProject(tasks, filters.activeProject);
}

export function countTasksInEpic(tasks: Task[], epicId: string): number {
	return tasks.filter((task) => task.epic_id === epicId).length;
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

export function countTasksInScope(tasks: Task[], scopeId: number): number {
	return tasks.filter((task) => task.scope_id === scopeId).length;
}

export function countInProgress(tasks: Task[]): number {
	return tasks.filter((task) => task.status === "in-progress").length;
}
