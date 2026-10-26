import {
	countChildrenByEpic,
	countTasksByStatus,
	listTasks,
} from "../server/tasks";
import { getDb } from "../server/db";
import { taskStats } from "./contracts";
import { defineQuery } from "./define";
import { strictObject } from "./strict";

export const getTaskStats = defineQuery({
	name: "tasks_stats",
	output: taskStats,
	description:
		"Read the aggregate task counts shown by the navigation and the filters: the number of non-epic tasks per status across every project, and every epic with children_counts. Read-only. Soft-deleted tasks are not counted. Returns: {tasks, epics} - tasks is a map of status to count, epics lists each epic as a task with children_counts: the number of its child tasks per status plus their total. Use it instead of counting a loaded page.",
	kind: "query",
	input: strictObject({}),
	handler: () => {
		const db = getDb();
		const children = countChildrenByEpic(db);
		return {
			tasks: countTasksByStatus(db),
			epics: listTasks(db, { is_epic: true, sort: "number", order: "asc" }).map(
				(epic) => ({ ...epic, children_counts: children[epic.id] }),
			),
		};
	},
});
