import type { DatabaseSync } from "node:sqlite";
import {
	PRIORITIES,
	PRIORITY_RANK,
	STATUSES,
	STATUS_RANK,
	type Status,
	type Task,
} from "../../types";
import { blockingInfoFor } from "../links";
import { buildTaskFilter } from "./filter";
import {
	mapTask,
	parseFields,
	pickFields,
	taskById,
	taskWithShortDescription,
} from "./rows";
import { lookupTask, resolveTaskId, TASK_NUMBER_PATTERN } from "./resolve";
import type { TaskQuery, TaskRow, TasksByIds } from "./types";

export function withBlockingInfo(db: DatabaseSync, tasks: Task[]): Task[] {
	if (tasks.length === 0) {
		return tasks;
	}
	const info = blockingInfoFor(
		db,
		tasks.map((task) => task.id),
	);
	return tasks.map((task) => {
		const entry = info.get(task.id);
		return entry
			? {
					...task,
					blocked_by: entry.blocked_by,
					blocks: entry.blocks,
					relates_to: entry.relates_to,
					duplicates: entry.duplicates,
					duplicated_by: entry.duplicated_by,
				}
			: task;
	});
}

export function getTask(db: DatabaseSync, id: string): Task | undefined {
	const task = taskById(db, id);
	if (task) {
		return task.deleted_at === null
			? withBlockingInfo(db, [task])[0]
			: undefined;
	}
	const resolved = resolveTaskId(db, id);
	if (resolved.isErr()) {
		return undefined;
	}
	return withBlockingInfo(db, [taskById(db, resolved.value)!])[0];
}

export function getTasksByIds(db: DatabaseSync, ids: string[]): TasksByIds {
	const unique = [...new Set(ids)];
	if (unique.length === 0) {
		return { items: [], missing: [] };
	}

	const resolvedInput = new Map<string, string>();
	for (const id of unique) {
		const trimmed = id.trim();
		if (TASK_NUMBER_PATTERN.test(trimmed)) {
			continue;
		}
		const found = lookupTask(db, trimmed);
		if (found) {
			resolvedInput.set(id, found.id);
		}
	}

	const resolvedIds = [...new Set([...resolvedInput.values()])];
	const found =
		resolvedIds.length > 0
			? (db
					.prepare(
						`SELECT * FROM tasks WHERE id IN (${resolvedIds.map(() => "?").join(", ")}) AND deleted_at IS NULL`,
					)
					.all(...resolvedIds) as unknown as TaskRow[])
			: [];
	const byId = new Map(found.map((row) => [row.id, mapTask(row)]));

	const items: Task[] = [];
	const missing: string[] = [];
	for (const id of unique) {
		const fullId = resolvedInput.get(id);
		const task = fullId ? byId.get(fullId) : undefined;
		if (task) {
			items.push(task);
		} else {
			missing.push(id);
		}
	}
	return { items: withBlockingInfo(db, items), missing };
}

export function listTasks(db: DatabaseSync, query: TaskQuery = {}): Task[] {
	const { where, params, joins } = buildTaskFilter(query);

	const columns = [
		"tasks.*",
		"(SELECT COUNT(*) FROM task_attachments a WHERE a.task_id = tasks.id) AS attachments_count",
	];
	if (query.include_project) {
		columns.push("projects.name AS project_name");
	}
	if (query.include_scope) {
		columns.push("scopes.name AS scope_name");
	}
	const selectSql = `SELECT ${columns.join(", ")}`;

	let sql = `${selectSql} FROM tasks${joins}`;
	if (where.length > 0) {
		sql += ` WHERE ${where.join(" AND ")}`;
	}

	const sort = query.sort ?? "updated_at";
	const ascending =
		sort === "priority" ||
		sort === "status" ||
		sort === "project" ||
		sort === "number" ||
		sort === "title"
			? "asc"
			: "desc";
	const order = (query.order ?? ascending).toUpperCase();
	if (sort === "priority") {
		const rank = PRIORITIES.map(
			(p) => `WHEN '${p}' THEN ${PRIORITY_RANK[p]}`,
		).join(" ");
		sql += ` ORDER BY CASE tasks.priority ${rank} ELSE 99 END ${order}, tasks.updated_at DESC, tasks.id ASC`;
	} else if (sort === "status") {
		const rank = STATUSES.map(
			(status) => `WHEN '${status}' THEN ${STATUS_RANK[status]}`,
		).join(" ");
		sql += ` ORDER BY CASE tasks.status ${rank} ELSE 99 END ${order}, tasks.id ASC`;
	} else if (sort === "project") {
		sql += ` ORDER BY (SELECT name FROM projects WHERE id = tasks.project_id) ${order}, tasks.number ASC, tasks.id ASC`;
	} else if (sort === "number") {
		sql += ` ORDER BY tasks.number ${order}, tasks.project_id ASC, tasks.id ASC`;
	} else if (sort === "title") {
		sql += ` ORDER BY ULOWER(tasks.title) ${order}, tasks.id ASC`;
	} else if (sort === "closed_at") {
		sql += ` ORDER BY (tasks.closed_at IS NULL) ASC, tasks.closed_at ${order}, tasks.id ASC`;
	} else {
		sql += ` ORDER BY tasks.${sort} ${order}, tasks.id ASC`;
	}

	if (query.limit !== undefined) {
		sql += " LIMIT ?";
		params.push(query.limit);
	}
	if (query.offset !== undefined) {
		sql += " OFFSET ?";
		params.push(query.offset);
	}

	const tasks = (db.prepare(sql).all(...params) as unknown as TaskRow[]).map(
		mapTask,
	);
	const selectedFields = parseFields(query.fields);
	const includeDescription =
		query.include_description === true ||
		(selectedFields?.includes("description") ?? false);
	const described = tasks.map((task) =>
		taskWithShortDescription(task, includeDescription),
	);
	const withBlocking = withBlockingInfo(db, described);
	return selectedFields
		? withBlocking.map((task) => pickFields(task, selectedFields))
		: withBlocking;
}

export function countTasks(db: DatabaseSync, query: TaskQuery = {}): number {
	const { where, params, joins } = buildTaskFilter(query);
	let sql = `SELECT COUNT(*) AS count FROM tasks${joins}`;
	if (where.length > 0) {
		sql += ` WHERE ${where.join(" AND ")}`;
	}
	const row = db.prepare(sql).get(...params) as { count: number };
	return row.count;
}

function countByStatus(
	db: DatabaseSync,
	projectId: string,
	isEpic: boolean,
): Record<Status, number> {
	const rows = db
		.prepare(
			"SELECT status, COUNT(*) AS count FROM tasks WHERE project_id = ? AND deleted_at IS NULL AND is_epic = ? GROUP BY status",
		)
		.all(projectId, isEpic ? 1 : 0) as { status: string; count: number }[];

	const counts = Object.fromEntries(
		STATUSES.map((status) => [status, 0]),
	) as Record<Status, number>;
	for (const row of rows) {
		counts[row.status as Status] = row.count;
	}
	return counts;
}

export function countTasksByStatus(
	db: DatabaseSync,
	projectId: string,
): Record<Status, number> {
	return countByStatus(db, projectId, false);
}

export function countEpicsByStatus(
	db: DatabaseSync,
	projectId: string,
): Record<Status, number> {
	return countByStatus(db, projectId, true);
}

export interface EpicChildCounts extends Record<Status, number> {
	total: number;
}

export function countEpicChildrenByStatus(
	db: DatabaseSync,
	epicId: string,
): EpicChildCounts {
	const rows = db
		.prepare(
			"SELECT status, COUNT(*) AS count FROM tasks WHERE epic_id = ? AND deleted_at IS NULL GROUP BY status",
		)
		.all(epicId) as { status: string; count: number }[];

	const counts = Object.fromEntries(
		STATUSES.map((status) => [status, 0]),
	) as Record<Status, number>;
	let total = 0;
	for (const row of rows) {
		counts[row.status as Status] = row.count;
		total += row.count;
	}
	return { ...counts, total };
}
