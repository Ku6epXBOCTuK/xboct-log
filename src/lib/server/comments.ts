import { err, ok, type Result } from "neverthrow";
import { randomUUIDv7 } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Comment } from "../types";
import { AppError, guard, invalid, notFound } from "./errors";
import { withTransaction } from "./db";
import { recordRevision } from "./revisions";
import { resolveTaskId } from "./tasks";

const MAX_BODY_LENGTH = 20_000;

interface CommentRow {
	id: string;
	task_id: string;
	body: string;
	created_at: string;
	edited_at: string | null;
	deleted_at: string | null;
}

export interface NewComment {
	task_id: string;
	body: string;
}

function mapComment(row: CommentRow): Comment {
	return {
		id: row.id,
		task_id: row.task_id,
		body: row.body,
		created_at: row.created_at,
		edited_at: row.edited_at,
		deleted_at: row.deleted_at,
	};
}

function normalizeBody(body: string): Result<string, AppError> {
	const trimmed = body.trim();
	if (!trimmed) {
		return err(invalid("comment body is required"));
	}
	if (trimmed.length > MAX_BODY_LENGTH) {
		return err(
			invalid(`comment body is longer than ${MAX_BODY_LENGTH} characters`),
		);
	}
	return ok(trimmed);
}

export function getComment(db: DatabaseSync, id: string): Comment | undefined {
	const row = db
		.prepare("SELECT * FROM task_comments WHERE id = ?")
		.get(id) as unknown as CommentRow | undefined;
	return row ? mapComment(row) : undefined;
}

export function listComments(db: DatabaseSync, taskId: string): Comment[] {
	const rows = db
		.prepare(
			// NOTE: created_at has millisecond precision, so rowid decides the
			// order of the comments written in the same millisecond.
			`SELECT * FROM task_comments
			 WHERE task_id = ? AND deleted_at IS NULL
			 ORDER BY created_at ASC, rowid ASC`,
		)
		.all(taskId) as unknown as CommentRow[];
	return rows.map(mapComment);
}

export function addComment(
	db: DatabaseSync,
	input: NewComment,
): Result<Comment, AppError> {
	const resolved = resolveTaskId(db, input.task_id);
	if (resolved.isErr()) {
		return err(resolved.error);
	}
	const body = normalizeBody(input.body ?? "");
	if (body.isErr()) {
		return err(body.error);
	}

	const id = randomUUIDv7();
	const now = new Date().toISOString();

	return guard(() => {
		db.prepare(
			`INSERT INTO task_comments (id, task_id, body, created_at)
			 VALUES (?, ?, ?, ?)`,
		).run(id, resolved.value, body.value, now);
		return getComment(db, id)!;
	});
}

export function editComment(
	db: DatabaseSync,
	id: string,
	body: string,
): Result<Comment, AppError> {
	const current = getComment(db, id);
	if (!current || current.deleted_at !== null) {
		return err(notFound(`comment ${id} not found`));
	}
	const next = normalizeBody(body);
	if (next.isErr()) {
		return err(next.error);
	}
	if (next.value === current.body) {
		return ok(current);
	}

	const now = new Date().toISOString();

	return guard(() =>
		withTransaction(db, () => {
			recordRevision(
				db,
				{
					task_id: current.task_id,
					field: "comment",
					ref_id: current.id,
					body: current.body,
				},
				new Date(now),
			);
			db.prepare(
				"UPDATE task_comments SET body = ?, edited_at = ? WHERE id = ?",
			).run(next.value, now, id);
			return getComment(db, id)!;
		}),
	);
}

export function deleteComment(
	db: DatabaseSync,
	id: string,
): Result<Comment, AppError> {
	const current = getComment(db, id);
	if (!current || current.deleted_at !== null) {
		return err(notFound(`comment ${id} not found`));
	}

	const now = new Date().toISOString();

	return guard(() => {
		db.prepare("UPDATE task_comments SET deleted_at = ? WHERE id = ?").run(
			now,
			id,
		);
		return getComment(db, id)!;
	});
}
