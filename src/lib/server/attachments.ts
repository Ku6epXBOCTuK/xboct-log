import { err, ok, type Result } from "neverthrow";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, extname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
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
}

export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

// NOTE: a resource travels base64 inside JSON-RPC, so the upper bound is
// lower than MAX_ATTACHMENT_SIZE to keep a single response readable
export const MAX_RESOURCE_SIZE = 8 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	ico: "image/x-icon",
	pdf: "application/pdf",
	txt: "text/plain",
	md: "text/markdown",
	json: "application/json",
	csv: "text/csv",
	zip: "application/zip",
};

interface AttachmentRow {
	id: string;
	task_id: string;
	file_name: string;
	mime_type: string | null;
	size: number;
	stored_name: string;
	created_at: string;
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

function extensionOf(name: string): string {
	const ext = extname(name).slice(1).toLowerCase();
	return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "";
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
				"SELECT * FROM task_attachments ORDER BY task_id ASC, created_at ASC",
			)
			.all() as unknown as AttachmentRow[];
	}
	return db
		.prepare(
			"SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at ASC, id ASC",
		)
		.all(taskId) as unknown as AttachmentRow[];
}

export function listAttachments(
	db: DatabaseSync,
	taskId: string,
): Attachment[] {
	return rowsOf(db, taskId).map((row) => ({
		...toAttachment(row),
		missing: !existsSync(storedPath(row)),
	}));
}

export function listAllAttachments(db: DatabaseSync): Attachment[] {
	return rowsOf(db).map((row) => ({
		...toAttachment(row),
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
	for (const row of rowsOf(db, taskId)) {
		const item = {
			...toAttachment(row),
			missing: !existsSync(storedPath(row)),
		};
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
	mimeType?: string,
): Result<Attachment, AppError> {
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
	const ext = extensionOf(name);
	const storedName = ext === "" ? id : `${id}.${ext}`;
	const directory = join(mediaDir(), taskId);
	try {
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, storedName), data);
	} catch (error) {
		return err(unexpected(error));
	}
	const mime = mimeType ?? MIME_BY_EXTENSION[ext] ?? null;
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
	mimeType?: string,
): Result<Attachment, AppError> {
	const cleaned = content.replace(/\s+/g, "");
	if (cleaned === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
		return err(invalid("the content is not valid base64"));
	}
	return addAttachment(
		db,
		taskId,
		fileName,
		Buffer.from(cleaned, "base64"),
		mimeType,
	);
}

export function deleteAttachment(
	db: DatabaseSync,
	id: string,
): Result<{ id: string }, AppError> {
	const row = rowById(db, id);
	if (!row) {
		return err(notFound(`no attachment with the id ${id}`));
	}
	db.prepare("DELETE FROM task_attachments WHERE id = ?").run(id);
	try {
		rmSync(storedPath(row), { force: true });
	} catch {
		// NOTE: the row is gone, a leftover file is harmless
	}
	return ok({ id });
}

export function readAttachmentFile(
	db: DatabaseSync,
	id: string,
): Result<{ attachment: Attachment; data: Buffer }, AppError> {
	const row = rowById(db, id);
	if (!row) {
		return err(notFound(`no attachment with the id ${id}`));
	}
	const path = storedPath(row);
	if (!existsSync(path)) {
		return err(
			notFound(
				`the file ${row.file_name} of the attachment ${id} is gone from the media folder`,
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

export function readAttachmentResource(
	db: DatabaseSync,
	id: string,
): Result<{ attachment: Attachment; data: Buffer }, AppError> {
	const result = readAttachmentFile(db, id);
	if (result.isErr()) {
		return err(result.error);
	}
	const { attachment, data } = result.value;
	if (data.byteLength > MAX_RESOURCE_SIZE) {
		return err(
			invalid(
				`the file ${attachment.file_name} is ${Math.round(data.byteLength / 1024 / 1024)} MB, an MCP resource is limited to ${MAX_RESOURCE_SIZE / 1024 / 1024} MB; fetch it from /media/${id} instead`,
			),
		);
	}
	return ok(result.value);
}

export function removeTaskAttachments(db: DatabaseSync, taskId: string): void {
	for (const row of rowsOf(db, taskId)) {
		try {
			rmSync(storedPath(row), { force: true });
		} catch {
			// NOTE: the file is already gone
		}
	}
}
