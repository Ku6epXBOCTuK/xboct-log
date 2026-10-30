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

export const REVISION_MERGE_MS = 30 * 60_000;

// NOTE: the body is the text from before the edit, so skipping a row inside
// the window keeps the chain correct: the previous text is still the start of
// the same editing session, only the intermediate snapshots are dropped.
export function recordRevision(
	db: DatabaseSync,
	revision: NewRevision,
	now: Date = new Date(),
): void {
	const refId = revision.ref_id ?? null;
	const latest = db
		.prepare(
			`SELECT created_at FROM task_revisions
			 WHERE task_id = ? AND field = ? AND ref_id IS ?
			 ORDER BY id DESC LIMIT 1`,
		)
		.get(revision.task_id, revision.field, refId) as
		{ created_at: string } | undefined;

	if (latest !== undefined) {
		const elapsed = now.getTime() - Date.parse(latest.created_at);
		if (elapsed >= 0 && elapsed < REVISION_MERGE_MS) return;
	}

	db.prepare(
		`INSERT INTO task_revisions (task_id, field, ref_id, body, created_at)
		 VALUES (?, ?, ?, ?, ?)`,
	).run(
		revision.task_id,
		revision.field,
		refId,
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
