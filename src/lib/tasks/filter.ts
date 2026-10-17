import type { Priority, Status, Task } from "#lib/types.ts";

export interface FilterCriteria {
	activeProject: string;
	status: Status | "all";
	priority: Priority | "all";
	epic: string;
	scope: "any" | "none" | number;
	selectedTags: string[];
	query: string;
}

export function filterTasks(tasks: Task[], criteria: FilterCriteria): Task[] {
	const needle = criteria.query.trim().toLowerCase();

	return tasks.filter((task) => {
		if (
			criteria.activeProject !== "all" &&
			task.project_id !== criteria.activeProject
		) {
			return false;
		}
		if (criteria.status !== "all" && task.status !== criteria.status) {
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

export function countTasksInProject(tasks: Task[], projectId: string): number {
	return tasks.filter((task) => task.project_id === projectId).length;
}

export function countTasksInEpic(tasks: Task[], epicId: string): number {
	return tasks.filter((task) => task.epic_id === epicId).length;
}

export function countTasksInScope(tasks: Task[], scopeId: number): number {
	return tasks.filter((task) => task.scope_id === scopeId).length;
}

export function countInProgress(tasks: Task[]): number {
	return tasks.filter((task) => task.status === "in-progress").length;
}
