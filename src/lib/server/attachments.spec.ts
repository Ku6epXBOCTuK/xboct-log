import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Result } from "neverthrow";
import { describe, expect, it, afterEach } from "vitest";
import {
	addAttachment,
	addAttachmentFromBase64,
	addAttachmentFromPath,
	deleteAttachment,
	listAttachments,
	listDeletedAttachments,
	MAX_ATTACHMENT_SIZE,
	mediaDir,
	purgeAttachment,
	purgeSoftDeletedAttachments,
	readAttachmentFile,
	readDeletedAttachmentFile,
	restoreAttachment,
	verifyAttachments,
} from "./attachments";
import type { AppError } from "./errors";
import { openMigratedDatabase } from "./migrations";
import { createProject } from "./projects";
import { createTask, deleteTask } from "./tasks";

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

const folders: string[] = [];
const savedMediaDir = process.env.XBOCT_LOG_MEDIA_DIR;

afterEach(() => {
	if (savedMediaDir === undefined) {
		delete process.env.XBOCT_LOG_MEDIA_DIR;
	} else {
		process.env.XBOCT_LOG_MEDIA_DIR = savedMediaDir;
	}
	while (folders.length > 0) {
		const folder = folders.pop();
		if (folder) rmSync(folder, { recursive: true, force: true });
	}
});

function mediaFolder(): string {
	const folder = mkdtempSync(join(tmpdir(), "xboct-media-"));
	folders.push(folder);
	process.env.XBOCT_LOG_MEDIA_DIR = folder;
	return folder;
}

async function setup(): Promise<{ db: DatabaseSync; taskId: string }> {
	mediaFolder();
	const db = await openMigratedDatabase(":memory:");
	createProject(db, { id: "spa", name: "Shop", prefix: "SPA" });
	const task = createTask(db, { project_id: "spa", title: "With a picture" });
	return { db, taskId: task._unsafeUnwrap().id };
}

describe("attachments", () => {
	it("stores a file and lists it", async () => {
		const { db, taskId } = await setup();
		const result = addAttachment(db, taskId, "photo.png", Buffer.from("bytes"));
		expect(result.isOk()).toBe(true);
		const item = result._unsafeUnwrap();
		expect(item.file_name).toBe("photo.png");
		expect(item.mime_type).toBe("image/png");
		expect(item.missing).toBe(false);

		const items = listAttachments(db, taskId);
		expect(items).toHaveLength(1);
		expect(items[0].id).toBe(item.id);
		expect(existsSync(join(mediaDir(), taskId))).toBe(true);
	});

	it("reads the content back", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"note.txt",
			Buffer.from("hello"),
		)._unsafeUnwrap();
		const read = readAttachmentFile(db, item.id)._unsafeUnwrap();
		expect(read.data.toString()).toBe("hello");
		expect(read.attachment.file_name).toBe("note.txt");
	});

	it("points every attachment at its resource", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"note.txt",
			Buffer.from("hello"),
		)._unsafeUnwrap();
		expect(item.uri).toBe(`xboct-log://attachment/${item.id}`);
		expect(listAttachments(db, taskId)[0].uri).toBe(item.uri);
	});

	it("reads the file back", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"note.txt",
			Buffer.from("hello"),
		)._unsafeUnwrap();
		const file = readAttachmentFile(db, item.id)._unsafeUnwrap();
		expect(file.data.toString()).toBe("hello");
	});

	it("applies one size limit to every attachment", async () => {
		const { db, taskId } = await setup();
		const tooBig = addAttachment(
			db,
			taskId,
			"big.zip",
			Buffer.alloc(MAX_ATTACHMENT_SIZE + 1),
		);
		expect(tooBig.isErr()).toBe(true);
		expect(tooBig._unsafeUnwrapErr().message).toContain("20 MB");
	});

	it("rejects a type outside the allowlist", async () => {
		const { db, taskId } = await setup();
		for (const name of ["page.html", "logo.svg", "tool.exe", "build.bin"]) {
			const result = addAttachment(db, taskId, name, Buffer.from("bytes"));
			expect(result.isErr()).toBe(true);
			expect(result._unsafeUnwrapErr().message).toContain("not supported");
		}
		expect(listAttachments(db, taskId)).toHaveLength(0);
	});

	it("takes the mime type from the extension", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"photo.JPEG",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		expect(item.mime_type).toBe("image/jpeg");
	});

	it("rejects a file without an extension", async () => {
		const { db, taskId } = await setup();
		const result = addAttachment(
			db,
			taskId,
			"screenshot",
			Buffer.from("bytes"),
		);
		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr().message).toContain("not supported");
	});

	it("rejects an empty file", async () => {
		const { db, taskId } = await setup();
		const result = addAttachment(db, taskId, "empty.png", Buffer.alloc(0));
		expect(result.isErr()).toBe(true);
	});

	it("adds a file from a path", async () => {
		const { db, taskId } = await setup();
		const folder = mediaFolder();
		const source = join(folder, "source.png");
		writeFileSync(source, "from disk");
		const item = addAttachmentFromPath(db, taskId, source)._unsafeUnwrap();
		expect(item.file_name).toBe("source.png");
		const read = readAttachmentFile(db, item.id)._unsafeUnwrap();
		expect(read.data.toString()).toBe("from disk");
	});

	it("adds a file from base64", async () => {
		const { db, taskId } = await setup();
		const item = addAttachmentFromBase64(
			db,
			taskId,
			"b64.png",
			Buffer.from("encoded").toString("base64"),
		)._unsafeUnwrap();
		const read = readAttachmentFile(db, item.id)._unsafeUnwrap();
		expect(read.data.toString()).toBe("encoded");
	});

	it("rejects a broken base64", async () => {
		const { db, taskId } = await setup();
		const result = addAttachmentFromBase64(
			db,
			taskId,
			"b64.png",
			"not base64!!",
		);
		expect(result.isErr()).toBe(true);
	});

	it("reports a file that is gone from the media folder", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"gone.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		rmSync(join(mediaDir(), taskId), { recursive: true, force: true });

		const items = listAttachments(db, taskId);
		expect(items[0].missing).toBe(true);

		const check = verifyAttachments(db);
		expect(check.ok).toHaveLength(0);
		expect(check.missing).toHaveLength(1);
		expect(check.missing[0].id).toBe(item.id);

		const read = readAttachmentFile(db, item.id);
		expect(read.isErr()).toBe(true);
	});

	it("hides a deleted attachment but keeps the file", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"photo.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		const result = deleteAttachment(db, item.id)._unsafeUnwrap();
		expect(result.deleted_at).not.toBeNull();
		expect(listAttachments(db, taskId)).toHaveLength(0);
		expect(listDeletedAttachments(db, taskId)).toHaveLength(1);
		expect(listDeletedAttachments(db, taskId)[0]?.task_title).toBe(
			"With a picture",
		);
		expect(existsSync(join(mediaDir(), taskId, `${item.id}.png`))).toBe(true);
		expect(deleteAttachment(db, item.id).isErr()).toBe(true);
	});

	it("stops serving a deleted attachment", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"photo.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		deleteAttachment(db, item.id);
		expect(readAttachmentFile(db, item.id).isErr()).toBe(true);
	});

	it("previews a deleted attachment until it is restored", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"photo.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		expect(readDeletedAttachmentFile(db, item.id).isErr()).toBe(true);

		deleteAttachment(db, item.id)._unsafeUnwrap();
		const read = unwrap(readDeletedAttachmentFile(db, item.id));
		expect(read.attachment.deleted_at).not.toBeNull();
		expect(read.data.toString()).toBe("bytes");

		restoreAttachment(db, item.id)._unsafeUnwrap();
		expect(readDeletedAttachmentFile(db, item.id).isErr()).toBe(true);

		deleteAttachment(db, item.id)._unsafeUnwrap();
		rmSync(join(mediaDir(), taskId), { recursive: true, force: true });
		expect(readDeletedAttachmentFile(db, item.id).isErr()).toBe(true);
	});

	it("restores a deleted attachment onto its task", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"photo.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		deleteAttachment(db, item.id);

		const restored = restoreAttachment(db, item.id)._unsafeUnwrap();
		expect(restored.deleted_at).toBeNull();
		expect(restored.task_id).toBe(taskId);
		expect(listAttachments(db, taskId)).toHaveLength(1);
		expect(
			readAttachmentFile(db, item.id)._unsafeUnwrap().data.toString(),
		).toBe("bytes");
		expect(restoreAttachment(db, item.id).isErr()).toBe(true);
	});

	it("refuses to restore into a deleted task", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"photo.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		deleteAttachment(db, item.id);
		unwrap(deleteTask(db, taskId));

		const result = restoreAttachment(db, item.id);
		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr().message).toContain("restore the task");
	});

	it("refuses to restore when the file is gone", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"photo.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		deleteAttachment(db, item.id);
		rmSync(join(mediaDir(), taskId), { recursive: true, force: true });

		expect(listDeletedAttachments(db, taskId)[0].missing).toBe(true);
		const result = restoreAttachment(db, item.id);
		expect(result.isErr()).toBe(true);
		expect(result._unsafeUnwrapErr().message).toContain("gone");
	});

	it("purges a deleted attachment for good", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"photo.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		deleteAttachment(db, item.id);

		const purged = purgeAttachment(db, item.id)._unsafeUnwrap();
		expect(purged.file_removed).toBe(true);
		expect(listDeletedAttachments(db)).toHaveLength(0);
		expect(existsSync(join(mediaDir(), taskId, `${item.id}.png`))).toBe(false);
		expect(purgeAttachment(db, item.id).isErr()).toBe(true);
	});

	it("purges only the attachments deleted long enough", async () => {
		const { db, taskId } = await setup();
		const old = addAttachment(
			db,
			taskId,
			"old.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		const fresh = addAttachment(
			db,
			taskId,
			"fresh.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		const alive = addAttachment(
			db,
			taskId,
			"alive.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		deleteAttachment(db, old.id);
		deleteAttachment(db, fresh.id);
		const now = new Date("2026-11-01T12:00:00.000Z");
		const daysAgo = (days: number) =>
			new Date(now.getTime() - days * 86_400_000).toISOString();
		db.prepare("UPDATE task_attachments SET deleted_at = ? WHERE id = ?").run(
			daysAgo(40),
			old.id,
		);
		db.prepare("UPDATE task_attachments SET deleted_at = ? WHERE id = ?").run(
			daysAgo(2),
			fresh.id,
		);

		const outcome = purgeSoftDeletedAttachments(db, 30, now);
		expect(outcome).toEqual({ purged: 1, gone: 0 });
		expect(listDeletedAttachments(db).map((item) => item.id)).toEqual([
			fresh.id,
		]);
		expect(listAttachments(db, taskId).map((item) => item.id)).toEqual([
			alive.id,
		]);
	});

	it("purges a deleted attachment whose file is already gone", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"photo.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		deleteAttachment(db, item.id);
		rmSync(join(mediaDir(), taskId), { recursive: true, force: true });
		db.prepare("UPDATE task_attachments SET deleted_at = ? WHERE id = ?").run(
			"2020-01-01T00:00:00.000Z",
			item.id,
		);

		const outcome = purgeSoftDeletedAttachments(db);
		expect(outcome).toEqual({ purged: 0, gone: 1 });
		expect(listDeletedAttachments(db)).toHaveLength(0);
	});
});
