import { err, type Result } from "neverthrow";
import type { DatabaseSync } from "node:sqlite";
import {
	CLOSED_REASONS,
	CLOSED_STATUSES,
	PRIORITIES,
	PRIORITY_RANK,
	STATUSES,
	STATUS_BY_REASON,
	type ClosedReason,
	type Priority,
	type Status,
	type Task,
} from "../types";
import { AppError, guard, invalid, notFound } from "./errors";
import { getProject } from "./projects";

interface TaskRow {
	id: string;
	project_id: string;
	number: number;
	title: string;
	description: string;
	status: string;
	priority: string;
	is_epic: number;
	epic_id: string | null;
	source_file: string | null;
	source_line: number | null;
	tags: string;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	closed_reason: string | null;
}

export interface NewTask {
	project_id: string;
	title: string;
	description?: string;
	status?: Status;
	priority?: Priority;
	is_epic?: boolean;
	epic_id?: string | null;
	source_file?: string | null;
	source_line?: number | null;
	tags?: string[];
}

export interface TaskPatch {
	title?: string;
	description?: string;
	status?: Status;
	priority?: Priority;
	is_epic?: boolean;
	epic_id?: string | null;
	source_file?: string | null;
	source_line?: number | null;
	tags?: string[];
}

export interface TaskQuery {
	project_id?: string;
	status?: Status[];
	priority?: Priority[];
	tag?: string[];
	is_epic?: boolean;
	epic_id?: string | null;
	q?: string;
	sort?: "updated_at" | "created_at" | "priority";
	order?: "asc" | "desc";
	limit?: number;
	offset?: number;
}

function mapTask(row: TaskRow): Task {
	return {
		id: row.id,
		project_id: row.project_id,
		number: row.number,
		title: row.title,
		description: row.description,
		status: row.status as Status,
		priority: row.priority as Priority,
		is_epic: row.is_epic === 1,
		epic_id: row.epic_id,
		source_file: row.source_file,
		source_line: row.source_line,
		tags: JSON.parse(row.tags) as string[],
		created_at: row.created_at,
		updated_at: row.updated_at,
		closed_at: row.closed_at,
		closed_reason: row.closed_reason as ClosedReason | null,
	};
}

function isStatus(value: string): value is Status {
	return (STATUSES as readonly string[]).includes(value);
}

function isClosedReason(value: string): value is ClosedReason {
	return (CLOSED_REASONS as readonly string[]).includes(value);
}

function isPriority(value: string): value is Priority {
	return (PRIORITIES as readonly string[]).includes(value);
}

function emptyToNull(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function normalizeTags(tags: string[] | undefined): string[] {
	if (!tags) {
		return [];
	}
	const seen = new Set<string>();
	for (const raw of tags) {
		const tag = raw.trim();
		if (tag) {
			seen.add(tag);
		}
	}
	return [...seen];
}

function validateEpic(
	db: DatabaseSync,
	epicId: string,
	projectId: string,
	selfId: string | null,
): AppError | null {
	if (selfId !== null && epicId === selfId) {
		return invalid("a task cannot be its own epic");
	}
	const epic = db
		.prepare("SELECT id, project_id, is_epic FROM tasks WHERE id = ?")
		.get(epicId) as { project_id: string; is_epic: number } | undefined;
	if (!epic) {
		return notFound(`epic ${epicId} not found`);
	}
	if (epic.is_epic !== 1) {
		return invalid(`${epicId} is not an epic`);
	}
	if (epic.project_id !== projectId) {
		return invalid("epic must belong to the same project");
	}
	return null;
}

function taskById(db: DatabaseSync, id: string): Task | undefined {
	const row = db
		.prepare("SELECT * FROM tasks WHERE id = ?")
		.get(id) as unknown as TaskRow | undefined;
	return row ? mapTask(row) : undefined;
}

export function getTask(db: DatabaseSync, id: string): Task | undefined {
	return taskById(db, id);
}

function allocateNumber(db: DatabaseSync, projectId: string): number {
	const { high, used } = db
		.prepare(
			`SELECT
				COALESCE((SELECT last_number FROM task_number_high_water WHERE project_id = ?), 0) AS high,
				COALESCE((SELECT MAX(number) FROM tasks WHERE project_id = ?), 0) AS used`,
		)
		.get(projectId, projectId) as { high: number; used: number };
	const next = Math.max(high, used) + 1;
	db.prepare(
		`INSERT INTO task_number_high_water (project_id, last_number)
		 VALUES (?, ?)
		 ON CONFLICT (project_id) DO UPDATE SET last_number = excluded.last_number`,
	).run(projectId, next);
	return next;
}

export function createTask(
	db: DatabaseSync,
	input: NewTask,
): Result<Task, AppError> {
	const project = getProject(db, input.project_id);
	if (!project) {
		return err(notFound(`project ${input.project_id} not found`));
	}

	const title = input.title?.trim() ?? "";
	if (!title) {
		return err(invalid("task title is required"));
	}

	const status = input.status ?? "open";
	if (!isStatus(status)) {
		return err(invalid(`invalid status: ${status}`));
	}
	const priority = input.priority ?? "medium";
	if (!isPriority(priority)) {
		return err(invalid(`invalid priority: ${priority}`));
	}

	const tags = normalizeTags(input.tags);
	const sourceFile = emptyToNull(input.source_file);
	const sourceLine = input.source_line ?? null;
	if (sourceLine !== null && sourceFile === null) {
		return err(invalid("source_line requires source_file"));
	}

	const epicId = input.epic_id ? input.epic_id : null;
	if (epicId) {
		const epicError = validateEpic(db, epicId, project.id, null);
		if (epicError) {
			return err(epicError);
		}
	}

	const now = new Date().toISOString();
	const closedAt = CLOSED_STATUSES.includes(status) ? now : null;

	return guard(() => {
		db.exec("BEGIN IMMEDIATE");
		try {
			const n = allocateNumber(db, project.id);
			const id = `${project.prefix}-${n}`;

			db.prepare(
				`INSERT INTO tasks (
					id, project_id, number, title, description, status, priority, is_epic,
					epic_id, source_file, source_line, tags, created_at, updated_at, closed_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				id,
				project.id,
				n,
				title,
				input.description ?? "",
				status,
				priority,
				input.is_epic ? 1 : 0,
				epicId,
				sourceFile,
				sourceLine,
				JSON.stringify(tags),
				now,
				now,
				closedAt,
			);
			db.exec("COMMIT");
			return taskById(db, id)!;
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	});
}

export function listTasks(db: DatabaseSync, query: TaskQuery = {}): Task[] {
	const where: string[] = [];
	const params: (string | number)[] = [];

	if (query.project_id) {
		where.push("project_id = ?");
		params.push(query.project_id);
	}
	if (query.status?.length) {
		where.push(`status IN (${query.status.map(() => "?").join(", ")})`);
		params.push(...query.status);
	}
	if (query.priority?.length) {
		where.push(`priority IN (${query.priority.map(() => "?").join(", ")})`);
		params.push(...query.priority);
	}
	if (query.is_epic !== undefined) {
		where.push("is_epic = ?");
		params.push(query.is_epic ? 1 : 0);
	}
	if (query.epic_id !== undefined) {
		if (query.epic_id === null) {
			where.push("epic_id IS NULL");
		} else {
			where.push("epic_id = ?");
			params.push(query.epic_id);
		}
	}
	if (query.tag?.length) {
		where.push(
			`EXISTS (SELECT 1 FROM json_each(tasks.tags) WHERE json_each.value IN (${query.tag
				.map(() => "?")
				.join(", ")}))`,
		);
		params.push(...query.tag);
	}
	if (query.q) {
		const like = `%${query.q.toLowerCase()}%`;
		where.push(
			"(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(id) LIKE ?)",
		);
		params.push(like, like, like);
	}

	let sql = "SELECT * FROM tasks";
	if (where.length > 0) {
		sql += ` WHERE ${where.join(" AND ")}`;
	}

	const sort = query.sort ?? "updated_at";
	const order = query.order ?? (sort === "priority" ? "asc" : "desc");
	if (sort === "priority") {
		const rank = PRIORITIES.map(
			(p) => `WHEN '${p}' THEN ${PRIORITY_RANK[p]}`,
		).join(" ");
		sql += ` ORDER BY CASE priority ${rank} ELSE 99 END ${order.toUpperCase()}, updated_at DESC`;
	} else {
		sql += ` ORDER BY ${sort} ${order.toUpperCase()}`;
	}

	if (query.limit !== undefined) {
		sql += " LIMIT ?";
		params.push(query.limit);
	}
	if (query.offset !== undefined) {
		sql += " OFFSET ?";
		params.push(query.offset);
	}

	return (db.prepare(sql).all(...params) as unknown as TaskRow[]).map(mapTask);
}

export function countTasksByStatus(
	db: DatabaseSync,
	projectId: string,
): Record<Status, number> {
	const rows = db
		.prepare(
			"SELECT status, COUNT(*) AS count FROM tasks WHERE project_id = ? GROUP BY status",
		)
		.all(projectId) as { status: string; count: number }[];

	const counts = Object.fromEntries(
		STATUSES.map((status) => [status, 0]),
	) as Record<Status, number>;
	for (const row of rows) {
		counts[row.status as Status] = row.count;
	}
	return counts;
}

export function updateTask(
	db: DatabaseSync,
	id: string,
	patch: TaskPatch,
): Result<Task, AppError> {
	const current = getTask(db, id);
	if (!current) {
		return err(notFound(`task ${id} not found`));
	}

	const sets: string[] = [];
	const params: (string | number | null)[] = [];
	const now = new Date().toISOString();

	if (patch.title !== undefined) {
		const title = patch.title.trim();
		if (!title) {
			return err(invalid("task title is required"));
		}
		sets.push("title = ?");
		params.push(title);
	}
	if (patch.description !== undefined) {
		sets.push("description = ?");
		params.push(patch.description);
	}
	if (patch.status !== undefined) {
		if (!isStatus(patch.status)) {
			return err(invalid(`invalid status: ${patch.status}`));
		}
		sets.push("status = ?");
		params.push(patch.status);

		if (CLOSED_STATUSES.includes(patch.status) && current.closed_at === null) {
			sets.push("closed_at = ?");
			params.push(now);
		} else if (
			!CLOSED_STATUSES.includes(patch.status) &&
			current.closed_at !== null
		) {
			sets.push("closed_at = ?");
			params.push(null);
			sets.push("closed_reason = ?");
			params.push(null);
		}
	}
	if (patch.priority !== undefined) {
		if (!isPriority(patch.priority)) {
			return err(invalid(`invalid priority: ${patch.priority}`));
		}
		sets.push("priority = ?");
		params.push(patch.priority);
	}
	if (patch.is_epic !== undefined) {
		sets.push("is_epic = ?");
		params.push(patch.is_epic ? 1 : 0);
	}
	if (patch.tags !== undefined) {
		sets.push("tags = ?");
		params.push(JSON.stringify(normalizeTags(patch.tags)));
	}

	const sourceFile =
		patch.source_file !== undefined
			? emptyToNull(patch.source_file)
			: current.source_file;
	const sourceLine =
		patch.source_line !== undefined ? patch.source_line : current.source_line;
	if (sourceLine !== null && sourceFile === null) {
		return err(invalid("source_line requires source_file"));
	}
	if (patch.source_file !== undefined) {
		sets.push("source_file = ?");
		params.push(sourceFile);
	}
	if (patch.source_line !== undefined) {
		sets.push("source_line = ?");
		params.push(sourceLine);
	}

	if (patch.epic_id !== undefined) {
		const epicId = patch.epic_id ? patch.epic_id : null;
		if (epicId) {
			const epicError = validateEpic(db, epicId, current.project_id, id);
			if (epicError) {
				return err(epicError);
			}
		}
		sets.push("epic_id = ?");
		params.push(epicId);
	}

	sets.push("updated_at = ?");
	params.push(now);

	return guard(() => {
		db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(
			...params,
			id,
		);
		return taskById(db, id)!;
	});
}

export function closeTask(
	db: DatabaseSync,
	id: string,
	reason: ClosedReason,
): Result<Task, AppError> {
	if (!isClosedReason(reason)) {
		return err(invalid(`invalid close reason: ${reason}`));
	}
	if (!getTask(db, id)) {
		return err(notFound(`task ${id} not found`));
	}

	const now = new Date().toISOString();

	return guard(() => {
		db.prepare(
			`UPDATE tasks
			 SET status = ?, closed_at = ?, closed_reason = ?, updated_at = ?
			 WHERE id = ?`,
		).run(STATUS_BY_REASON[reason], now, reason, now, id);
		return taskById(db, id)!;
	});
}

export function deleteTask(
	db: DatabaseSync,
	id: string,
): Result<string, AppError> {
	if (!getTask(db, id)) {
		return err(notFound(`task ${id} not found`));
	}

	return guard(() => {
		db.exec("BEGIN IMMEDIATE");
		try {
			db.prepare("UPDATE tasks SET epic_id = NULL WHERE epic_id = ?").run(id);
			db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
			db.exec("COMMIT");
			return id;
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	});
}
