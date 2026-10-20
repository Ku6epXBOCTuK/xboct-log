import type { DatabaseSync } from "node:sqlite";

export const REVISION_FIELDS = ["description", "comment"] as const;

export type RevisionField = (typeof REVISION_FIELDS)[number];

export interface Revision {
	id: number;
	task_id: string;
	field: RevisionField;
	ref_id: string | null;
	body: string;
	created_at: string;
}

export interface NewRevision {
	task_id: string;
	field: RevisionField;
	ref_id?: string | null;
	body: string;
}

export function recordRevision(
	db: DatabaseSync,
	revision: NewRevision,
	now: Date = new Date(),
): void {
	db.prepare(
		`INSERT INTO task_revisions (task_id, field, ref_id, body, created_at)
		 VALUES (?, ?, ?, ?, ?)`,
	).run(
		revision.task_id,
		revision.field,
		revision.ref_id ?? null,
		revision.body,
		now.toISOString(),
	);
}

export function listRevisions(db: DatabaseSync, taskId: string): Revision[] {
	const rows = db
		.prepare(
			`SELECT id, task_id, field, ref_id, body, created_at
			 FROM task_revisions
			 WHERE task_id = ?
			 ORDER BY id ASC`,
		)
		.all(taskId) as unknown as {
		id: number;
		task_id: string;
		field: string;
		ref_id: string | null;
		body: string;
		created_at: string;
	}[];

	return rows.map((row) => ({
		id: row.id,
		task_id: row.task_id,
		field: row.field as RevisionField,
		ref_id: row.ref_id,
		body: row.body,
		created_at: row.created_at,
	}));
}
