import { err, ok, type Result } from "neverthrow";
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
import { AppError, guard, invalid, notFound, type ErrorKind } from "./errors";
import {
	blockingInfoFor,
	deleteBlockedByLinks,
	listBlocks,
	releaseBlockedStatus,
} from "./blockers";
import { getProject, resolveProjectRef } from "./projects";
import { recordRevision } from "./revisions";

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
	scope_id: number | null;
	source_file: string | null;
	source_line: number | null;
	tags: string;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	closed_reason: string | null;
	deleted_at: string | null;
	project_name?: string;
	scope_name?: string;
}

export interface NewTask {
	project_id: string;
	title: string;
	description?: string;
	status?: Status;
	priority?: Priority;
	is_epic?: boolean;
	epic_id?: string | null;
	scope_id?: number | null;
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
	scope_id?: number | null;
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
	scope_id?: number | null;
	blocked_by?: string;
	blocks?: string;
	q?: string;
	title?: string;
	title_exact?: string;
	fields?: string;
	include_project?: boolean;
	include_scope?: boolean;
	project_archived?: boolean;
	sort?: "updated_at" | "created_at" | "priority";
	order?: "asc" | "desc";
	limit?: number;
	offset?: number;
	include_deleted?: boolean;
	include_description?: boolean;
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
		scope_id: row.scope_id,
		source_file: row.source_file,
		source_line: row.source_line,
		tags: JSON.parse(row.tags) as string[],
		created_at: row.created_at,
		updated_at: row.updated_at,
		closed_at: row.closed_at,
		closed_reason: row.closed_reason as ClosedReason | null,
		deleted_at: row.deleted_at,
		project_name: row.project_name ?? undefined,
		scope_name: row.scope_name ?? undefined,
	};
}

function parseFields(fields: string | undefined): string[] | null {
	if (!fields) {
		return null;
	}
	const requested = fields
		.split(",")
		.map((field) => field.trim())
		.filter(Boolean);
	return requested.length > 0 ? [...new Set(requested)] : null;
}

function pickFields(task: Task, fields: string[]): Task {
	const source = task as unknown as Record<string, unknown>;
	const picked: Record<string, unknown> = {};
	for (const field of fields) {
		if (source[field] !== undefined) {
			picked[field] = source[field];
		}
	}
	const pickedTask = picked as unknown as Task;
	return Object.keys(picked).length > 0 ? pickedTask : task;
}

const SHORT_DESCRIPTION_LENGTH = 120;

function shortDescription(description: string): string {
	const firstLine = description.split("\n")[0].trim();
	return firstLine.length > SHORT_DESCRIPTION_LENGTH
		? `${firstLine.slice(0, SHORT_DESCRIPTION_LENGTH)}…`
		: firstLine;
}

function taskWithShortDescription(
	task: Task,
	includeDescription: boolean,
): Task {
	const short_description = shortDescription(task.description);
	if (includeDescription) {
		return { ...task, short_description };
	}
	const result: Record<string, unknown> = { ...task, short_description };
	delete result.description;
	return result as unknown as Task;
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

interface EpicRow {
	id: string;
	project_id: string;
	is_epic: number;
	deleted_at: string | null;
}

export function resolveEpicId(
	db: DatabaseSync,
	input: string,
	projectId: string,
	selfId?: string,
): Result<string, AppError> {
	const trimmed = input.trim();
	let row: EpicRow | undefined;
	if (TASK_NUMBER_PATTERN.test(trimmed)) {
		row = db
			.prepare(
				"SELECT id, project_id, is_epic, deleted_at FROM tasks WHERE number = ? AND project_id = ? AND deleted_at IS NULL",
			)
			.get(Number(trimmed), projectId) as EpicRow | undefined;
		if (!row) {
			return err(notFound(`epic ${trimmed} not found in project ${projectId}`));
		}
	} else {
		for (const candidate of taskIdCandidates(trimmed)) {
			const found = db
				.prepare(
					"SELECT id, project_id, is_epic, deleted_at FROM tasks WHERE id = ?",
				)
				.get(candidate) as EpicRow | undefined;
			if (found && found.deleted_at === null) {
				row = found;
				break;
			}
		}
		if (!row) {
			return err(notFound(`epic ${trimmed} not found`));
		}
	}
	if (selfId !== undefined && row.id === selfId) {
		return err(invalid("a task cannot be its own epic"));
	}
	if (row.is_epic !== 1) {
		return err(invalid(`${row.id} is not an epic`));
	}
	if (row.project_id !== projectId) {
		return err(invalid("epic must belong to the same project"));
	}
	return ok(row.id);
}

function validateScope(
	db: DatabaseSync,
	scopeId: number,
	projectId: string,
): AppError | null {
	const scope = db
		.prepare("SELECT project_id FROM scopes WHERE id = ?")
		.get(scopeId) as { project_id: string } | undefined;
	if (!scope) {
		return notFound(`scope ${scopeId} not found`);
	}
	if (scope.project_id !== projectId) {
		return invalid("scope must belong to the same project");
	}
	return null;
}

function taskById(db: DatabaseSync, id: string): Task | undefined {
	const row = db
		.prepare("SELECT * FROM tasks WHERE id = ?")
		.get(id) as unknown as TaskRow | undefined;
	return row ? mapTask(row) : undefined;
}

const TASK_NUMBER_PATTERN = /^\d+$/;

function normalizeTaskIdInput(id: string): string {
	const dash = id.lastIndexOf("-");
	if (dash <= 0) {
		return id;
	}
	const number = id.slice(dash + 1);
	if (!TASK_NUMBER_PATTERN.test(number)) {
		return id;
	}
	return `${id.slice(0, dash).toUpperCase()}-${number}`;
}

function taskIdCandidates(id: string): string[] {
	const candidates = [id];
	const normalized = normalizeTaskIdInput(id);
	if (normalized !== id) {
		candidates.push(normalized);
	}
	return candidates;
}

interface TaskRefRow {
	id: string;
	project_id: string;
}

function lookupTask(db: DatabaseSync, id: string): TaskRefRow | undefined {
	for (const candidate of taskIdCandidates(id)) {
		const found = db
			.prepare(
				"SELECT id, project_id FROM tasks WHERE id = ? AND deleted_at IS NULL",
			)
			.get(candidate) as TaskRefRow | undefined;
		if (found) {
			return found;
		}
	}
	return undefined;
}

function resolveProjectId(
	db: DatabaseSync,
	ref: string | undefined,
): Result<string | undefined, AppError> {
	const trimmed = ref?.trim() ?? "";
	if (trimmed === "") {
		return ok(undefined);
	}
	const project = resolveProjectRef(db, trimmed);
	if (!project) {
		return err(notFound(`project ${trimmed} not found`));
	}
	return ok(project.id);
}

function nearTaskIds(
	db: DatabaseSync,
	projectId: string,
	number: number,
): string[] {
	const rows = db
		.prepare(
			`SELECT id FROM tasks
			 WHERE project_id = ? AND number BETWEEN ? AND ? AND deleted_at IS NULL
			 ORDER BY ABS(number - ?) LIMIT 3`,
		)
		.all(projectId, number - 3, number + 3, number) as { id: string }[];
	return rows.map((row) => row.id);
}

function hintForFullId(db: DatabaseSync, id: string): string | undefined {
	const dash = id.lastIndexOf("-");
	if (dash <= 0) {
		return undefined;
	}
	const prefix = id.slice(0, dash);
	const number = id.slice(dash + 1);
	if (!TASK_NUMBER_PATTERN.test(number)) {
		return undefined;
	}
	const project = resolveProjectRef(db, prefix);
	if (!project) {
		const prefixes = (
			db.prepare("SELECT prefix FROM projects ORDER BY prefix").all() as {
				prefix: string;
			}[]
		).map((row) => row.prefix);
		return prefixes.length > 0
			? `unknown project prefix '${prefix}' (known: ${prefixes.join(", ")})`
			: undefined;
	}
	const near = nearTaskIds(db, project.id, Number(number));
	return near.length > 0 ? `did you mean ${near.join(" or ")}?` : undefined;
}

function hintForNumber(
	db: DatabaseSync,
	number: number,
	projectId: string | undefined,
): string | undefined {
	if (projectId === undefined) {
		return undefined;
	}
	const row = db
		.prepare(
			"SELECT id FROM tasks WHERE number = ? AND project_id <> ? AND deleted_at IS NULL ORDER BY id LIMIT 1",
		)
		.get(number, projectId) as { id: string } | undefined;
	return row ? `did you mean ${row.id}?` : undefined;
}

export function resolveTaskId(
	db: DatabaseSync,
	input: string,
	inProject?: string,
): Result<string, AppError> {
	const trimmed = input.trim();
	const projectResult = resolveProjectId(db, inProject);
	if (projectResult.isErr()) {
		return err(projectResult.error);
	}
	const project = projectResult.value;
	if (TASK_NUMBER_PATTERN.test(trimmed)) {
		const rows = (
			project
				? db
						.prepare(
							"SELECT id FROM tasks WHERE number = ? AND project_id = ? AND deleted_at IS NULL ORDER BY id",
						)
						.all(Number(trimmed), project)
				: db
						.prepare(
							"SELECT id FROM tasks WHERE number = ? AND deleted_at IS NULL ORDER BY project_id, id",
						)
						.all(Number(trimmed))
		) as { id: string }[];
		if (rows.length === 0) {
			const hint = hintForNumber(db, Number(trimmed), project);
			return err(
				notFound(
					`task ${trimmed} not found${
						project ? ` in project ${project}` : ""
					}${hint ? ` — ${hint}` : ""}`,
				),
			);
		}
		if (rows.length > 1) {
			return err(
				invalid(
					`task number ${trimmed} is ambiguous: ${rows
						.map((row) => row.id)
						.join(", ")} — use the full id${
						project ? ` or pass in_project: "${project}"` : ""
					}`,
				),
			);
		}
		return ok(rows[0].id);
	}
	const found = lookupTask(db, trimmed);
	if (!found) {
		const hint = hintForFullId(db, trimmed);
		return err(
			notFound(`task ${trimmed} not found${hint ? ` — ${hint}` : ""}`),
		);
	}
	if (project && found.project_id !== project) {
		return err(
			invalid(
				`task ${found.id} belongs to project ${found.project_id}, not ${project}`,
			),
		);
	}
	return ok(found.id);
}

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
			? { ...task, blocked_by: entry.blocked_by, blocks: entry.blocks }
			: task;
	});
}

export function getTask(
	db: DatabaseSync,
	id: string,
	inProject?: string,
): Task | undefined {
	const task = taskById(db, id);
	if (task) {
		return task.deleted_at === null
			? withBlockingInfo(db, [task])[0]
			: undefined;
	}
	const resolved = resolveTaskId(db, id, inProject);
	if (resolved.isErr()) {
		return undefined;
	}
	return withBlockingInfo(db, [taskById(db, resolved.value)!])[0];
}

export interface TasksByIds {
	items: Task[];
	missing: string[];
}

export function getTasksByIds(
	db: DatabaseSync,
	ids: string[],
	inProject?: string,
): TasksByIds {
	const unique = [...new Set(ids)];
	if (unique.length === 0) {
		return { items: [], missing: [] };
	}

	const projectResult = resolveProjectId(db, inProject);
	if (projectResult.isErr()) {
		return { items: [], missing: unique };
	}
	const project = projectResult.value;

	const numbers = unique
		.filter((id) => TASK_NUMBER_PATTERN.test(id.trim()))
		.map((id) => Number(id.trim()));
	const rowsByNumber = new Map<number, string[]>();
	if (numbers.length > 0) {
		const rows = (
			project
				? db
						.prepare(
							`SELECT number, id FROM tasks
							 WHERE number IN (${numbers.map(() => "?").join(", ")}) AND project_id = ? AND deleted_at IS NULL
							 ORDER BY id`,
						)
						.all(...numbers, project)
				: db
						.prepare(
							`SELECT number, id FROM tasks
							 WHERE number IN (${numbers.map(() => "?").join(", ")}) AND deleted_at IS NULL
							 ORDER BY project_id, id`,
						)
						.all(...numbers)
		) as { number: number; id: string }[];
		for (const row of rows) {
			const list = rowsByNumber.get(row.number) ?? [];
			list.push(row.id);
			rowsByNumber.set(row.number, list);
		}
	}

	const resolvedInput = new Map<string, string>();
	for (const id of unique) {
		const trimmed = id.trim();
		if (TASK_NUMBER_PATTERN.test(trimmed)) {
			const candidates = rowsByNumber.get(Number(trimmed)) ?? [];
			if (candidates.length === 1) {
				resolvedInput.set(id, candidates[0]);
			}
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
	let resolvedEpicId: string | null = null;
	if (epicId) {
		const resolved = resolveEpicId(db, epicId, project.id);
		if (resolved.isErr()) {
			return err(resolved.error);
		}
		resolvedEpicId = resolved.value;
	}

	const scopeId = input.scope_id ?? null;
	if (scopeId !== null) {
		const scopeError = validateScope(db, scopeId, project.id);
		if (scopeError) {
			return err(scopeError);
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
					epic_id, scope_id, source_file, source_line, tags, created_at, updated_at, closed_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				id,
				project.id,
				n,
				title,
				input.description ?? "",
				status,
				priority,
				input.is_epic ? 1 : 0,
				resolvedEpicId,
				scopeId,
				sourceFile,
				sourceLine,
				JSON.stringify(tags),
				now,
				now,
				closedAt,
			);
			db.exec("COMMIT");
			return withBlockingInfo(db, [taskById(db, id)!])[0];
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	});
}

interface TaskFilterSql {
	where: string[];
	params: (string | number)[];
	joins: string;
}

function blockingIdMatch(value: string): {
	sql: string;
	params: (string | number)[];
} {
	const trimmed = value.trim();
	if (TASK_NUMBER_PATTERN.test(trimmed)) {
		return {
			sql: "(SELECT id FROM tasks WHERE number = ? AND deleted_at IS NULL)",
			params: [Number(trimmed)],
		};
	}
	return {
		sql: "(SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL)",
		params: [trimmed],
	};
}

function buildTaskFilter(query: TaskQuery): TaskFilterSql {
	const where: string[] = [];
	const params: (string | number)[] = [];
	let joins = "";

	if (!query.include_deleted) {
		where.push("tasks.deleted_at IS NULL");
	}

	if (query.project_id) {
		where.push("tasks.project_id = ?");
		params.push(query.project_id);
	}
	if (query.status?.length) {
		where.push(`tasks.status IN (${query.status.map(() => "?").join(", ")})`);
		params.push(...query.status);
	}
	if (query.priority?.length) {
		where.push(
			`tasks.priority IN (${query.priority.map(() => "?").join(", ")})`,
		);
		params.push(...query.priority);
	}
	if (query.is_epic !== undefined) {
		where.push("tasks.is_epic = ?");
		params.push(query.is_epic ? 1 : 0);
	}
	if (query.epic_id !== undefined) {
		if (query.epic_id === null) {
			where.push("tasks.epic_id IS NULL");
		} else if (TASK_NUMBER_PATTERN.test(query.epic_id.trim())) {
			where.push(
				`tasks.epic_id IN (SELECT id FROM tasks WHERE number = ? AND deleted_at IS NULL${
					query.project_id ? " AND project_id = ?" : ""
				})`,
			);
			params.push(Number(query.epic_id.trim()));
			if (query.project_id) {
				params.push(query.project_id);
			}
		} else {
			where.push("tasks.epic_id = ?");
			params.push(query.epic_id);
		}
	}
	if (query.scope_id !== undefined) {
		if (query.scope_id === null) {
			where.push("tasks.scope_id IS NULL");
		} else {
			where.push("tasks.scope_id = ?");
			params.push(query.scope_id);
		}
	}
	if (query.blocked_by !== undefined) {
		const match = blockingIdMatch(query.blocked_by);
		where.push(
			`tasks.id IN (SELECT blocked_task_id FROM task_blocked_by WHERE blocked_by_task_id IN ${match.sql})`,
		);
		params.push(...match.params);
	}
	if (query.blocks !== undefined) {
		const match = blockingIdMatch(query.blocks);
		where.push(
			`tasks.id IN (SELECT blocked_by_task_id FROM task_blocked_by WHERE blocked_task_id IN ${match.sql})`,
		);
		params.push(...match.params);
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
			`(LOWER(tasks.title) LIKE ? OR LOWER(tasks.description) LIKE ? OR LOWER(tasks.id) LIKE ?
			  OR EXISTS (SELECT 1 FROM json_each(tasks.tags) WHERE LOWER(json_each.value) LIKE ?))`,
		);
		params.push(like, like, like, like);
	}
	if (query.title) {
		const like = `%${query.title.toLowerCase()}%`;
		where.push("LOWER(tasks.title) LIKE ?");
		params.push(like);
	}
	if (query.title_exact) {
		where.push("LOWER(tasks.title) = LOWER(?)");
		params.push(query.title_exact);
	}
	if (query.include_project === true || query.project_archived !== undefined) {
		joins += " LEFT JOIN projects ON tasks.project_id = projects.id";
	}
	if (query.include_scope === true) {
		joins += " LEFT JOIN scopes ON tasks.scope_id = scopes.id";
	}
	if (query.project_archived === true) {
		where.push("projects.archived_at IS NOT NULL");
	} else if (query.project_archived === false) {
		where.push("projects.archived_at IS NULL");
	}

	return { where, params, joins };
}

export function listTasks(db: DatabaseSync, query: TaskQuery = {}): Task[] {
	const { where, params, joins } = buildTaskFilter(query);

	const columns = ["tasks.*"];
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
	const order = query.order ?? (sort === "priority" ? "asc" : "desc");
	if (sort === "priority") {
		const rank = PRIORITIES.map(
			(p) => `WHEN '${p}' THEN ${PRIORITY_RANK[p]}`,
		).join(" ");
		sql += ` ORDER BY CASE tasks.priority ${rank} ELSE 99 END ${order.toUpperCase()}, tasks.updated_at DESC`;
	} else {
		sql += ` ORDER BY tasks.${sort} ${order.toUpperCase()}`;
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

export function updateTask(
	db: DatabaseSync,
	id: string,
	patch: TaskPatch,
	inProject?: string,
): Result<Task, AppError> {
	const resolved = resolveTaskId(db, id, inProject);
	if (resolved.isErr()) {
		return err(resolved.error);
	}
	const targetId = resolved.value;
	const current = taskById(db, targetId)!;

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
		let resolvedEpicId: string | null = null;
		if (epicId) {
			const resolved = resolveEpicId(db, epicId, current.project_id, targetId);
			if (resolved.isErr()) {
				return err(resolved.error);
			}
			resolvedEpicId = resolved.value;
		}
		sets.push("epic_id = ?");
		params.push(resolvedEpicId);
	}

	if (patch.scope_id !== undefined) {
		const scopeId = patch.scope_id;
		if (scopeId !== null) {
			const scopeError = validateScope(db, scopeId, current.project_id);
			if (scopeError) {
				return err(scopeError);
			}
		}
		sets.push("scope_id = ?");
		params.push(scopeId);
	}

	sets.push("updated_at = ?");
	params.push(now);

	const descriptionChanged =
		patch.description !== undefined &&
		patch.description !== current.description;

	return guard(() => {
		db.exec("BEGIN IMMEDIATE");
		try {
			if (descriptionChanged) {
				recordRevision(db, {
					task_id: targetId,
					field: "description",
					body: current.description,
				});
			}
			db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(
				...params,
				targetId,
			);
			db.exec("COMMIT");
			return withBlockingInfo(db, [taskById(db, targetId)!])[0];
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	});
}

export function closeTask(
	db: DatabaseSync,
	id: string,
	reason: ClosedReason,
	inProject?: string,
): Result<Task, AppError> {
	if (!isClosedReason(reason)) {
		return err(invalid(`invalid close reason: ${reason}`));
	}
	const resolved = resolveTaskId(db, id, inProject);
	if (resolved.isErr()) {
		return err(resolved.error);
	}
	const targetId = resolved.value;

	const now = new Date().toISOString();

	return guard(() => {
		db.prepare(
			`UPDATE tasks
			 SET status = ?, closed_at = ?, closed_reason = ?, updated_at = ?
			 WHERE id = ?`,
		).run(STATUS_BY_REASON[reason], now, reason, now, targetId);
		releaseBlockedStatus(db, listBlocks(db, targetId));
		return withBlockingInfo(db, [taskById(db, targetId)!])[0];
	});
}

export interface BatchError {
	kind: ErrorKind;
	message: string;
}

export type BatchItem =
	| { id: string; ok: true; task: Task }
	| { id: string; ok: false; error: BatchError };

export type CreateBatchItem =
	| { index: number; ok: true; task: Task }
	| { index: number; ok: false; error: BatchError };

export function createTasksMany(
	db: DatabaseSync,
	items: NewTask[],
): CreateBatchItem[] {
	return items.map((item, index) => {
		const result = createTask(db, item);
		return result.isOk()
			? { index, ok: true, task: result.value }
			: {
					index,
					ok: false,
					error: { kind: result.error.kind, message: result.error.message },
				};
	});
}

function batchItem(id: string, result: Result<Task, AppError>): BatchItem {
	return result.isOk()
		? { id, ok: true, task: result.value }
		: {
				id,
				ok: false,
				error: { kind: result.error.kind, message: result.error.message },
			};
}

export function closeTasksMany(
	db: DatabaseSync,
	items: { id: string; reason: ClosedReason }[],
	inProject?: string,
): BatchItem[] {
	return items.map((item) =>
		batchItem(item.id, closeTask(db, item.id, item.reason, inProject)),
	);
}

export function updateTasksMany(
	db: DatabaseSync,
	items: { id: string; patch: TaskPatch }[],
	inProject?: string,
): BatchItem[] {
	return items.map((item) =>
		batchItem(item.id, updateTask(db, item.id, item.patch, inProject)),
	);
}

function collectSubtree(db: DatabaseSync, rootId: string): string[] {
	const ids = [rootId];
	for (let index = 0; index < ids.length; index++) {
		const children = db
			.prepare("SELECT id FROM tasks WHERE epic_id = ? ORDER BY number")
			.all(ids[index]) as unknown as { id: string }[];
		for (const child of children) {
			ids.push(child.id);
		}
	}
	return ids;
}

export function moveTask(
	db: DatabaseSync,
	id: string,
	projectId: string,
	inProject?: string,
): Result<Task, AppError> {
	const resolved = resolveTaskId(db, id, inProject);
	if (resolved.isErr()) {
		return err(resolved.error);
	}
	const sourceId = resolved.value;
	const task = taskById(db, sourceId)!;
	const target = getProject(db, projectId);
	if (!target) {
		return err(notFound(`project ${projectId} not found`));
	}
	if (task.project_id === target.id) {
		return ok(task);
	}

	const now = new Date().toISOString();

	return guard(() => {
		db.exec("BEGIN IMMEDIATE");
		try {
			// NOTE: epic_id has no ON UPDATE CASCADE and foreign keys check
			// immediately, so rewriting ids before children follow fails.
			// PRAGMA defer_foreign_keys defers validation until COMMIT.
			db.exec("PRAGMA defer_foreign_keys = ON");

			const plan = collectSubtree(db, sourceId).map((oldId) => {
				const row = db
					.prepare("SELECT epic_id FROM tasks WHERE id = ?")
					.get(oldId) as { epic_id: string | null };
				return { oldId, oldEpicId: row.epic_id, newId: "", number: 0 };
			});
			for (const node of plan) {
				node.number = allocateNumber(db, target.id);
				node.newId = `${target.prefix}-${node.number}`;
			}

			const newIds = new Map(plan.map((node) => [node.oldId, node.newId]));
			for (const node of plan) {
				const newEpicId =
					node.oldEpicId === null ? null : (newIds.get(node.oldEpicId) ?? null);
				db.prepare(
					`UPDATE tasks
					 SET id = ?, project_id = ?, number = ?, epic_id = ?, scope_id = NULL, updated_at = ?
					 WHERE id = ?`,
				).run(node.newId, target.id, node.number, newEpicId, now, node.oldId);
			}
			db.exec("COMMIT");
			return withBlockingInfo(db, [taskById(db, newIds.get(sourceId)!)!])[0];
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	});
}

export function deleteTask(
	db: DatabaseSync,
	id: string,
	inProject?: string,
): Result<string, AppError> {
	const resolved = resolveTaskId(db, id, inProject);
	if (resolved.isErr()) {
		return err(resolved.error);
	}
	const targetId = resolved.value;

	const now = new Date().toISOString();

	return guard(() => {
		db.exec("BEGIN IMMEDIATE");
		try {
			const blockedTaskIds = listBlocks(db, targetId);
			db.prepare(
				"UPDATE tasks SET epic_id = NULL, updated_at = ? WHERE epic_id = ?",
			).run(now, targetId);
			db.prepare(
				"UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?",
			).run(now, now, targetId);
			deleteBlockedByLinks(db, targetId);
			releaseBlockedStatus(db, blockedTaskIds);
			db.exec("COMMIT");
			return targetId;
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	});
}
