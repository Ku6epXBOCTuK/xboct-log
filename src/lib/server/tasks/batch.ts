import type { DatabaseSync } from "node:sqlite";
import type { Result } from "neverthrow";
import type { ClosedReason } from "../../types";
import type { AppError } from "../errors";
import { createTask } from "./create";
import { closeTaskDetailed, updateTaskDetailed } from "./update";
import type {
	BatchItem,
	CreateBatchItem,
	NewTask,
	TaskPatch,
	TaskUpdateOutcome,
} from "./types";

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

function batchItem(
	id: string,
	result: Result<TaskUpdateOutcome, AppError>,
): BatchItem {
	return result.isOk()
		? {
				id,
				ok: true,
				task: result.value.task,
				changes: result.value.changes,
				released: result.value.released,
			}
		: {
				id,
				ok: false,
				error: { kind: result.error.kind, message: result.error.message },
			};
}

export function closeTasksMany(
	db: DatabaseSync,
	items: { id: string; reason: ClosedReason }[],
): BatchItem[] {
	return items.map((item) =>
		batchItem(item.id, closeTaskDetailed(db, item.id, item.reason)),
	);
}

export function updateTasksMany(
	db: DatabaseSync,
	items: { id: string; patch: TaskPatch }[],
): BatchItem[] {
	return items.map((item) =>
		batchItem(item.id, updateTaskDetailed(db, item.id, item.patch)),
	);
}
