import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it, afterEach } from "vitest";
import {
	addAttachment,
	addAttachmentFromBase64,
	addAttachmentFromPath,
	deleteAttachment,
	listAttachments,
	mediaDir,
	readAttachmentFile,
	verifyAttachments,
} from "./attachments";
import { openMigratedDatabase } from "./migrations";
import { createProject } from "./projects";
import { createTask } from "./tasks";

const folders: string[] = [];

afterEach(() => {
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

	it("deletes the file and the reference", async () => {
		const { db, taskId } = await setup();
		const item = addAttachment(
			db,
			taskId,
			"photo.png",
			Buffer.from("bytes"),
		)._unsafeUnwrap();
		const result = deleteAttachment(db, item.id);
		expect(result.isOk()).toBe(true);
		expect(listAttachments(db, taskId)).toHaveLength(0);
		expect(deleteAttachment(db, item.id).isErr()).toBe(true);
	});
});
