import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "neverthrow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listActivity } from "../server/activity";
import { closeDb, getDb } from "../server/db";
import type { AppError } from "../server/errors";
import { migrateDatabase } from "../server/migrations";
import { createProject } from "../server/projects";
import { createTask } from "../server/tasks";
import { runOp } from "./define";
import { getOps } from "./index.js";

let dbDir: string;
let savedMediaDir: string | undefined;

const CONTENT = Buffer.from("hello").toString("base64");

function unwrap<T>(result: Result<T, AppError>): T {
	expect(result.isOk()).toBe(true);
	return result._unsafeUnwrap();
}

beforeAll(async () => {
	savedMediaDir = process.env.XBOCT_LOG_MEDIA_DIR;
	dbDir = mkdtempSync(join(tmpdir(), "xboct-log-attachment-activity-"));
	process.env.XBOCT_LOG_MEDIA_DIR = join(dbDir, "media");
	const db = getDb(join(dbDir, "activity.db"));
	await migrateDatabase(db);
	unwrap(createProject(db, { id: "spa", name: "Shop", prefix: "SPA" }));
});

afterAll(() => {
	closeDb();
	if (savedMediaDir === undefined) {
		delete process.env.XBOCT_LOG_MEDIA_DIR;
	} else {
		process.env.XBOCT_LOG_MEDIA_DIR = savedMediaDir;
	}
	rmSync(dbDir, { recursive: true, force: true });
});

function op(name: string) {
	const found = getOps().get(name);
	if (!found) {
		throw new Error(`unknown op: ${name}`);
	}
	return found;
}

async function call(name: string, input: unknown): Promise<unknown> {
	return runOp(op(name), input, "ui");
}

function freshTask(): string {
	return unwrap(createTask(getDb(), { project_id: "spa", title: "Files" })).id;
}

async function attach(
	taskId: string,
	filename: string,
): Promise<{ id: string; file_name: string }> {
	const added = (await call("attachments_add", {
		task_id: taskId,
		filename,
		content_base64: CONTENT,
	})) as { item: { id: string; file_name: string } };
	return added.item;
}

function history(taskId: string) {
	return listActivity(getDb(), { entity: "task", entity_id: taskId }).items;
}

describe("attachment activity details", () => {
	it("records the name and the id of an added file", async () => {
		const taskId = freshTask();
		const item = await attach(taskId, "report.pdf");

		const added = history(taskId).find(
			(entry) => entry.op === "attachments_add",
		);
		expect(added?.fields).toEqual(["attachments"]);
		expect(added?.changes).toEqual([
			{
				field: "attachments",
				from: null,
				to: "report.pdf",
				ref_id: item.id,
			},
		]);
	});

	it("tells a deleted, a restored and a purged file apart", async () => {
		const taskId = freshTask();
		const item = await attach(taskId, "photo.png");
		const reference = { field: "attachments", ref_id: item.id };

		await call("attachments_delete", { attachment_id: item.id });
		await call("attachments_restore", { attachment_id: item.id });
		await call("attachments_delete", { attachment_id: item.id });
		const purged = (await call("attachments_purge", {
			attachment_id: item.id,
		})) as { task_id: string; file_name: string };

		expect(purged.task_id).toBe(taskId);
		expect(purged.file_name).toBe("photo.png");
		expect(
			history(taskId).map((entry) => ({
				op: entry.op,
				changes: entry.changes,
			})),
		).toEqual([
			{
				op: "attachments_purge",
				changes: [{ ...reference, from: "photo.png", to: null }],
			},
			{
				op: "attachments_delete",
				changes: [{ ...reference, from: "photo.png", to: null }],
			},
			{
				op: "attachments_restore",
				changes: [{ ...reference, from: null, to: "photo.png" }],
			},
			{
				op: "attachments_delete",
				changes: [{ ...reference, from: "photo.png", to: null }],
			},
			{
				op: "attachments_add",
				changes: [{ ...reference, from: null, to: "photo.png" }],
			},
		]);
	});

	it("keeps two files with the same name apart", async () => {
		const taskId = freshTask();
		const first = await attach(taskId, "receipt.pdf");
		const second = await attach(taskId, "receipt.pdf");

		const ids = history(taskId)
			.filter((entry) => entry.op === "attachments_add")
			.map((entry) => entry.changes[0]?.ref_id);

		expect(ids).toEqual([second.id, first.id]);
		expect(new Set(ids).size).toBe(2);
	});

	it("records a move on both tasks under the same ref_id", async () => {
		const source = freshTask();
		const target = freshTask();
		const item = await attach(source, "photo.png");

		const moved = (await call("attachments_move", {
			attachment_id: item.id,
			task_id: target,
		})) as { previous_task_id: string; was_deleted: boolean };
		expect(moved.previous_task_id).toBe(source);
		expect(moved.was_deleted).toBe(false);
		expect(history(source)[0]?.changes).toEqual([
			{ field: "attachments", from: "photo.png", to: null, ref_id: item.id },
		]);
		expect(history(target)[0]?.changes).toEqual([
			{ field: "attachments", from: null, to: "photo.png", ref_id: item.id },
		]);
	});

	it("records only the arrival when a deleted file is moved", async () => {
		const source = freshTask();
		const target = freshTask();
		const item = await attach(source, "photo.png");
		await call("attachments_delete", { attachment_id: item.id });

		await call("attachments_move", {
			attachment_id: item.id,
			task_id: target,
		});

		expect(history(source).map((entry) => entry.op)).toEqual([
			"attachments_delete",
			"attachments_add",
		]);
		expect(history(target).map((entry) => entry.op)).toEqual([
			"attachments_move",
		]);
		expect(history(target)[0]?.changes).toEqual([
			{ field: "attachments", from: null, to: "photo.png", ref_id: item.id },
		]);
	});

	it("records a copy as a new file with its own ref_id", async () => {
		const source = freshTask();
		const target = freshTask();
		const item = await attach(source, "photo.png");

		const copied = (await call("attachments_copy", {
			attachment_id: item.id,
			task_id: target,
		})) as { item: { id: string } };
		expect(copied.item.id).not.toBe(item.id);
		expect(history(target)[0]?.changes).toEqual([
			{
				field: "attachments",
				from: null,
				to: "photo.png",
				ref_id: copied.item.id,
			},
		]);
	});
});
