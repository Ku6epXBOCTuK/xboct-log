import type { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "neverthrow";
import { guard, notFound, type AppError } from "../errors";
import { withTransaction } from "../db";
import { getProject } from "../projects";
import { allocateNumber } from "./create";
import { withBlockingInfo } from "./read";
import { taskById } from "./rows";
import { resolveTaskId } from "./resolve";
import type { Task } from "../../types";

function collectSubtree(db: DatabaseSync, rootKey: string): string[] {
	const keys = [rootKey];
	for (let index = 0; index < keys.length; index++) {
		const children = db
			.prepare(
				`SELECT tasks.key AS key FROM tasks
				 WHERE tasks.epic_id = (SELECT id FROM tasks epic WHERE epic.key = ?)
				 ORDER BY tasks.number`,
			)
			.all(keys[index]) as unknown as { key: string }[];
		for (const child of children) {
			keys.push(child.key);
		}
	}
	return keys;
}

export function moveTask(
	db: DatabaseSync,
	id: string,
	projectId: string,
): Result<Task, AppError> {
	const resolved = resolveTaskId(db, id);
	if (resolved.isErr()) {
		return err(resolved.error);
	}
	const sourceKey = resolved.value;
	const task = taskById(db, sourceKey)!;
	const target = getProject(db, projectId);
	if (!target) {
		return err(notFound(`project ${projectId} not found`));
	}
	if (task.project_id === target.id) {
		return ok(task);
	}

	const now = new Date().toISOString();

	return guard(() =>
		withTransaction(db, () => {
			let movedKey = "";

			for (const key of collectSubtree(db, sourceKey)) {
				const number = allocateNumber(db, target.id);
				const newKey = `${target.prefix}-${number}`;
				if (key === sourceKey) {
					db.prepare(
						`UPDATE tasks
						 SET project_id = ?, number = ?, key = ?, epic_id = NULL, scope_id = NULL, updated_at = ?
						 WHERE key = ?`,
					).run(target.id, number, newKey, now, key);
					movedKey = newKey;
					continue;
				}
				db.prepare(
					`UPDATE tasks
					 SET project_id = ?, number = ?, key = ?, scope_id = NULL, updated_at = ?
					 WHERE key = ?`,
				).run(target.id, number, newKey, now, key);
			}

			return withBlockingInfo(db, [taskById(db, movedKey)!])[0];
		}),
	);
}
