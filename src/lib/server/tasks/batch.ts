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
			? {
					index,
					id: result.value.id,
					ok: true,
					task: result.value,
					changes: [],
					released: [],
				}
			: {
					index,
					id: null,
					ok: false,
					error: { kind: result.error.kind, message: result.error.message },
				};
	});
}

function batchItem(
	index: number,
	id: string,
	result: Result<TaskUpdateOutcome, AppError>,
): BatchItem {
	return result.isOk()
		? {
				index,
				id,
				ok: true,
				task: result.value.task,
				changes: result.value.changes,
				released: result.value.released ?? [],
			}
		: {
				index,
				id,
				ok: false,
				error: { kind: result.error.kind, message: result.error.message },
			};
}

export function closeTasksMany(
	db: DatabaseSync,
	items: { id: string; reason: ClosedReason }[],
): BatchItem[] {
	return items.map((item, index) =>
		batchItem(index, item.id, closeTaskDetailed(db, item.id, item.reason)),
	);
}

export function updateTasksMany(
	db: DatabaseSync,
	items: { id: string; patch: TaskPatch }[],
): BatchItem[] {
	return items.map((item, index) =>
		batchItem(index, item.id, updateTaskDetailed(db, item.id, item.patch)),
	);
}
