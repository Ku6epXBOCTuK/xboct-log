import type { DatabaseSync } from "node:sqlite";
import { STATUSES, type Status, type Task } from "../../types";
import { countTasks, listTasks } from "./read";
import type { TaskQuery } from "./types";

export interface BoardColumn {
	status: Status;
	count: number;
	items: Task[];
}

export interface TaskBoard {
	columns: BoardColumn[];
	total: number;
}

export function boardTasks(db: DatabaseSync, query: TaskQuery = {}): TaskBoard {
	const statuses = query.status?.length ? query.status : [...STATUSES];
	const columns = statuses.map((status) => {
		const scoped: TaskQuery = { ...query, status: [status] };
		return {
			status,
			count: countTasks(db, scoped),
			items: listTasks(db, scoped),
		};
	});
	return {
		columns,
		total: columns.reduce((sum, column) => sum + column.count, 0),
	};
}
