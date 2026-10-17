import { PRIORITY_RANK, STATUS_RANK, type Task } from "#lib/types.ts";

export type TaskSortKey = "priority" | "status" | "created" | "updated" | "id";
export type SortOrder = "asc" | "desc";

export const DEFAULT_SORT_KEY: TaskSortKey = "priority";
export const DEFAULT_SORT_ORDER: SortOrder = "asc";

export function defaultOrderFor(key: TaskSortKey): SortOrder {
	return key === "priority" || key === "status" ? "asc" : "desc";
}

function compareBy(left: Task, right: Task, key: TaskSortKey): number {
	switch (key) {
		case "priority":
			return PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
		case "status":
			return STATUS_RANK[left.status] - STATUS_RANK[right.status];
		case "created":
			return left.created_at.localeCompare(right.created_at);
		case "updated":
			return left.updated_at.localeCompare(right.updated_at);
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
): Task[] {
	const direction = order === "asc" ? 1 : -1;

	return [...tasks].sort((left, right) => {
		const primary = compareBy(left, right, key) * direction;
		if (primary !== 0) return primary;
		return right.updated_at.localeCompare(left.updated_at);
	});
}
