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
		if (criteria.epic === "only" && !task.is_epic) return false;
		if (criteria.epic === "inside" && task.epic_id === null) return false;
		if (
			criteria.epic !== "any" &&
			criteria.epic !== "none" &&
			criteria.epic !== "only" &&
			criteria.epic !== "inside" &&
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
			task.description.toLowerCase().includes(needle) ||
			(task.epic_id !== null && task.epic_id.toLowerCase().includes(needle))
		);
	});
}

export interface TagCount {
	tag: string;
	count: number;
	active: number;
}

export function collectTags(
	tasks: Task[],
	projectId: ProjectFilter = null,
	keep: string[] = [],
): TagCount[] {
	const counts = new Map<string, { count: number; active: number }>();

	for (const task of projectTasks(tasks, projectId)) {
		const active = CLOSED_STATUSES.includes(task.status) ? 0 : 1;

		for (const tag of task.tags) {
			const entry = counts.get(tag) ?? { count: 0, active: 0 };
			entry.count += 1;
			entry.active += active;
			counts.set(tag, entry);
		}
	}

	const entries = [...counts.entries()].map(([tag, entry]) => ({
		tag,
		...entry,
	}));

	for (const tag of keep) {
		if (!counts.has(tag)) {
			entries.push({ tag, count: 0, active: 0 });
		}
	}

	return entries.sort((left, right) => {
		const leftIdle = left.active === 0 ? 1 : 0;
		const rightIdle = right.active === 0 ? 1 : 0;
		if (leftIdle !== rightIdle) return leftIdle - rightIdle;
		return left.tag.localeCompare(right.tag);
	});
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

export function countActiveTasksInEpic(tasks: Task[], epicId: string): number {
	return tasks.filter(
		(task) => task.epic_id === epicId && !CLOSED_STATUSES.includes(task.status),
	).length;
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

export function countActiveTasksInScope(
	tasks: Task[],
	scopeId: number,
): number {
	return tasks.filter(
		(task) =>
			task.scope_id === scopeId && !CLOSED_STATUSES.includes(task.status),
	).length;
}

export function countInProgress(tasks: Task[]): number {
	return tasks.filter((task) => task.status === "in-progress").length;
}
