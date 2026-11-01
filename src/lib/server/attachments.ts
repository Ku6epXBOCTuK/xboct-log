import { err, ok, type Result } from "neverthrow";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { attachmentFormat } from "../tasks/attachment-kinds.ts";
import { envString } from "./env";
import { invalid, notFound, unexpected, type AppError } from "./errors";
import { defaultDbPath } from "./paths";

export interface Attachment {
	id: string;
	task_id: string;
	file_name: string;
	mime_type: string | null;
	size: number;
	created_at: string;
	uri: string;
	missing: boolean;
	deleted_at: string | null;
}

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

export const ATTACHMENT_PURGE_KEEP_DAYS = 30;

interface AttachmentRow {
	id: string;
	task_id: string;
	file_name: string;
	mime_type: string | null;
	size: number;
	stored_name: string;
	created_at: string;
	deleted_at: string | null;
}

interface DeletedRow extends AttachmentRow {
	task_title: string | null;
}

interface DeletedAttachment extends Attachment {
	task_title: string | null;
}

export function mediaDir(): string {
	const configured = envString("XBOCT_LOG_MEDIA_DIR", "");
	return configured !== undefined && configured !== ""
		? configured
		: join(dirname(defaultDbPath()), "media");
}

export function storedPath(row: AttachmentRow): string {
	return join(mediaDir(), row.task_id, row.stored_name);
}

function safeName(name: string): string {
	const base = (name.split(/[\\/]/).pop() ?? "file").trim();
	const cleaned = base.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
	return cleaned === "" ? "file" : cleaned;
}

export function attachmentUri(id: string): string {
	return `xboct-log://attachment/${id}`;
}

function toAttachment(row: AttachmentRow): Attachment {
	return {
		id: row.id,
		task_id: row.task_id,
		file_name: row.file_name,
		mime_type: row.mime_type,
		size: row.size,
		created_at: row.created_at,
		uri: attachmentUri(row.id),
		missing: false,
		deleted_at: row.deleted_at,
	};
}

function rowById(db: DatabaseSync, id: string): AttachmentRow | undefined {
	return db
		.prepare("SELECT * FROM task_attachments WHERE id = ?")
		.get(id) as unknown as AttachmentRow | undefined;
}

function rowsOf(db: DatabaseSync, taskId?: string): AttachmentRow[] {
	if (taskId === undefined) {
		return db
			.prepare(
				`SELECT * FROM task_attachments
				 WHERE deleted_at IS NULL
				 ORDER BY task_id ASC, created_at ASC`,
			)
			.all() as unknown as AttachmentRow[];
	}
	return db
		.prepare(
			`SELECT * FROM task_attachments
			 WHERE task_id = ? AND deleted_at IS NULL
			 ORDER BY created_at ASC, id ASC`,
		)
		.all(taskId) as unknown as AttachmentRow[];
}

function deletedRowsOf(db: DatabaseSync, taskId?: string): DeletedRow[] {
	if (taskId === undefined) {
		return db
			.prepare(
				`SELECT a.*, t.title AS task_title
				 FROM task_attachments a
				 LEFT JOIN tasks t ON t.id = a.task_id
				 WHERE a.deleted_at IS NOT NULL
				 ORDER BY a.deleted_at DESC, a.id ASC`,
			)
			.all() as unknown as DeletedRow[];
	}
	return db
		.prepare(
			`SELECT a.*, t.title AS task_title
			 FROM task_attachments a
			 LEFT JOIN tasks t ON t.id = a.task_id
			 WHERE a.task_id = ? AND a.deleted_at IS NOT NULL
			 ORDER BY a.deleted_at DESC, a.id ASC`,
		)
		.all(taskId) as unknown as DeletedRow[];
}

function withMissing(rows: AttachmentRow[]): Attachment[] {
	return rows.map((row) => ({
		...toAttachment(row),
		missing: !existsSync(storedPath(row)),
	}));
}

export function listAttachments(
	db: DatabaseSync,
	taskId: string,
): Attachment[] {
	return withMissing(rowsOf(db, taskId));
}

export function listAllAttachments(db: DatabaseSync): Attachment[] {
	return withMissing(rowsOf(db));
}

export function listDeletedAttachments(
	db: DatabaseSync,
	taskId?: string,
): DeletedAttachment[] {
	return deletedRowsOf(db, taskId).map((row) => ({
		...toAttachment(row),
		task_title: row.task_title,
		missing: !existsSync(storedPath(row)),
	}));
}

export function attachmentById(
	db: DatabaseSync,
	id: string,
): Attachment | undefined {
	const row = rowById(db, id);
	if (!row) return undefined;
	return { ...toAttachment(row), missing: !existsSync(storedPath(row)) };
}

export function verifyAttachments(
	db: DatabaseSync,
	taskId?: string,
): { ok: Attachment[]; missing: Attachment[] } {
	const okItems: Attachment[] = [];
	const missing: Attachment[] = [];
	for (const item of withMissing(rowsOf(db, taskId))) {
		if (item.missing) {
			missing.push(item);
		} else {
			okItems.push(item);
		}
	}
	return { ok: okItems, missing };
}

export function addAttachment(
	db: DatabaseSync,
	taskId: string,
	fileName: string,
	data: Buffer,
): Result<Attachment, AppError> {
	const format = attachmentFormat(fileName);
	if (format === null) {
		return err(invalid(`the file type of ${fileName} is not supported`));
	}
	const name = safeName(fileName);
	if (data.byteLength === 0) {
		return err(invalid("the file is empty"));
	}
	if (data.byteLength > MAX_ATTACHMENT_SIZE) {
		return err(
			invalid(
				`the file is too large: ${Math.round(data.byteLength / 1024 / 1024)} MB, the limit is ${MAX_ATTACHMENT_SIZE / 1024 / 1024} MB`,
			),
		);
	}
	const id = randomUUID();
	const storedName = `${id}.${format.extension}`;
	const directory = join(mediaDir(), taskId);
	try {
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, storedName), data);
	} catch (error) {
		return err(unexpected(error));
	}
	const mime = format.mime;
	const createdAt = new Date().toISOString();
	db.prepare(
		`INSERT INTO task_attachments (id, task_id, file_name, mime_type, size, stored_name, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
	).run(id, taskId, name, mime, data.byteLength, storedName, createdAt);
	return ok({
		id,
		task_id: taskId,
		file_name: name,
		mime_type: mime,
		size: data.byteLength,
		created_at: createdAt,
		uri: attachmentUri(id),
		missing: false,
		deleted_at: null,
	});
}

export function addAttachmentFromPath(
	db: DatabaseSync,
	taskId: string,
	sourcePath: string,
): Result<Attachment, AppError> {
	let data: Buffer;
	try {
		data = readFileSync(sourcePath);
	} catch {
		return err(notFound(`the file ${sourcePath} cannot be read`));
	}
	return addAttachment(db, taskId, sourcePath, data);
}

export function addAttachmentFromBase64(
	db: DatabaseSync,
	taskId: string,
	fileName: string,
	content: string,
): Result<Attachment, AppError> {
	const cleaned = content.replace(/\s+/g, "");
	if (cleaned === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
		return err(invalid("the content is not valid base64"));
	}
	return addAttachment(db, taskId, fileName, Buffer.from(cleaned, "base64"));
}

export function deleteAttachment(
	db: DatabaseSync,
	id: string,
): Result<Attachment, AppError> {
	const row = rowById(db, id);
	if (!row || row.deleted_at !== null) {
		return err(notFound(`no attachment with the id ${id}`));
	}
	const now = new Date().toISOString();
	db.prepare("UPDATE task_attachments SET deleted_at = ? WHERE id = ?").run(
		now,
		id,
	);
	return ok({ ...toAttachment(row), deleted_at: now });
}

export function restoreAttachment(
	db: DatabaseSync,
	id: string,
): Result<Attachment, AppError> {
	const row = rowById(db, id);
	if (!row || row.deleted_at === null) {
		return err(notFound(`no deleted attachment with the id ${id}`));
	}
	const task = db
		.prepare("SELECT deleted_at FROM tasks WHERE id = ?")
		.get(row.task_id) as { deleted_at: string | null } | undefined;
	if (task === undefined) {
		return err(
			notFound(`the task ${row.task_id} of the attachment ${id} is gone`),
		);
	}
	if (task.deleted_at !== null) {
		return err(
			invalid(`the task ${row.task_id} is deleted: restore the task first`),
		);
	}
	if (!existsSync(storedPath(row))) {
		return err(
			notFound(
				`the file ${row.file_name} of the attachment ${id} is gone from the media folder, there is nothing to restore`,
			),
		);
	}
	db.prepare("UPDATE task_attachments SET deleted_at = NULL WHERE id = ?").run(
		id,
	);
	return ok({ ...toAttachment(row), deleted_at: null });
}

export function purgeAttachment(
	db: DatabaseSync,
	id: string,
): Result<{ id: string; file_removed: boolean }, AppError> {
	const row = rowById(db, id);
	if (!row || row.deleted_at === null) {
		return err(notFound(`no deleted attachment with the id ${id}`));
	}
	const path = storedPath(row);
	const fileRemoved = existsSync(path);
	if (fileRemoved) {
		try {
			rmSync(path, { force: true });
		} catch {
			// NOTE: the row goes away anyway, a leftover file costs only disk
		}
	}
	db.prepare("DELETE FROM task_attachments WHERE id = ?").run(id);
	return ok({ id, file_removed: fileRemoved });
}

export function purgeSoftDeletedAttachments(
	db: DatabaseSync,
	keepDays: number = ATTACHMENT_PURGE_KEEP_DAYS,
	now: Date = new Date(),
): { purged: number; gone: number } {
	const cutoff = new Date(now.getTime() - keepDays * 86_400_000).toISOString();
	const rows = db
		.prepare(
			`SELECT * FROM task_attachments
			 WHERE deleted_at IS NOT NULL AND deleted_at < ?`,
		)
		.all(cutoff) as unknown as AttachmentRow[];
	const remove = db.prepare("DELETE FROM task_attachments WHERE id = ?");
	let purged = 0;
	let gone = 0;
	for (const row of rows) {
		if (existsSync(storedPath(row))) {
			try {
				rmSync(storedPath(row), { force: true });
			} catch {
				// NOTE: the row goes away anyway, a leftover file costs only disk
			}
			purged += 1;
		} else {
			gone += 1;
		}
		remove.run(row.id);
	}
	return { purged, gone };
}

function readStoredFile(
	row: AttachmentRow,
): Result<{ attachment: Attachment; data: Buffer }, AppError> {
	const path = storedPath(row);
	if (!existsSync(path)) {
		return err(
			notFound(
				`the file ${row.file_name} of the attachment ${row.id} is gone from the media folder`,
			),
		);
	}
	try {
		return ok({
			attachment: { ...toAttachment(row), missing: false },
			data: readFileSync(path),
		});
	} catch (error) {
		return err(unexpected(error));
	}
}

export function readAttachmentFile(
	db: DatabaseSync,
	id: string,
): Result<{ attachment: Attachment; data: Buffer }, AppError> {
	const row = rowById(db, id);
	if (!row || row.deleted_at !== null) {
		return err(notFound(`no attachment with the id ${id}`));
	}
	return readStoredFile(row);
}

export function readDeletedAttachmentFile(
	db: DatabaseSync,
	id: string,
): Result<{ attachment: Attachment; data: Buffer }, AppError> {
	const row = rowById(db, id);
	if (!row || row.deleted_at === null) {
		return err(notFound(`no deleted attachment with the id ${id}`));
	}
	return readStoredFile(row);
}

export function removeTaskAttachments(db: DatabaseSync, taskId: string): void {
	const rows = db
		.prepare("SELECT * FROM task_attachments WHERE task_id = ?")
		.all(taskId) as unknown as AttachmentRow[];
	for (const row of rows) {
		try {
			rmSync(storedPath(row), { force: true });
		} catch {
			// NOTE: the file is already gone
		}
	}
}
