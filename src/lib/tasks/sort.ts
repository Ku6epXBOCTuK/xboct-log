import { PRIORITY_RANK, STATUS_RANK, type Task } from "#lib/types.ts";

export type TaskSortKey =
	"priority" | "status" | "created" | "updated" | "closed" | "project" | "id";
export type SortOrder = "asc" | "desc";

export const DEFAULT_SORT_KEY: TaskSortKey = "priority";
export const DEFAULT_SORT_ORDER: SortOrder = "asc";

export interface SortContext {
	projectNames?: Map<string, string>;
}

export function defaultOrderFor(key: TaskSortKey): SortOrder {
	if (key === "priority" || key === "status" || key === "project") {
		return "asc";
	}
	return "desc";
}

function projectName(task: Task, context: SortContext): string {
	return context.projectNames?.get(task.project_id) ?? task.project_id;
}

function compareBy(
	left: Task,
	right: Task,
	key: TaskSortKey,
	context: SortContext,
): number {
	switch (key) {
		case "priority":
			return PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
		case "status":
			return STATUS_RANK[left.status] - STATUS_RANK[right.status];
		case "created":
			return left.created_at.localeCompare(right.created_at);
		case "updated":
			return left.updated_at.localeCompare(right.updated_at);
		case "closed":
			return (left.closed_at ?? "").localeCompare(right.closed_at ?? "");
		case "project":
			return (
				projectName(left, context).localeCompare(projectName(right, context)) ||
				left.number - right.number
			);
		case "id":
			return (
				left.number - right.number ||
				left.project_id.localeCompare(right.project_id)
			);
	}
}

export function sortTasks(
	tasks: Task[],
	key: TaskSortKey,
	order: SortOrder,
	context: SortContext = {},
): Task[] {
	const direction = order === "asc" ? 1 : -1;

	return [...tasks].sort((left, right) => {
		if (key === "closed") {
			const leftOpen = left.closed_at === null;
			const rightOpen = right.closed_at === null;
			if (leftOpen !== rightOpen) {
				return leftOpen ? 1 : -1;
			}
		}
		const primary = compareBy(left, right, key, context) * direction;
		if (primary !== 0) return primary;
		return right.updated_at.localeCompare(left.updated_at);
	});
}
