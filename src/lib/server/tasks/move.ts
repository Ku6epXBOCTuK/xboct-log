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

function collectSubtree(db: DatabaseSync, rootId: string): string[] {
	const ids = [rootId];
	for (let index = 0; index < ids.length; index++) {
		const children = db
			.prepare("SELECT id FROM tasks WHERE epic_id = ? ORDER BY number")
			.all(ids[index]) as unknown as { id: string }[];
		for (const child of children) {
			ids.push(child.id);
		}
	}
	return ids;
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
	const sourceId = resolved.value;
	const task = taskById(db, sourceId)!;
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
			// NOTE: epic_id has no ON UPDATE CASCADE and foreign keys check
			// immediately, so rewriting ids before children follow fails.
			// PRAGMA defer_foreign_keys defers validation until COMMIT.
			db.exec("PRAGMA defer_foreign_keys = ON");

			const plan = collectSubtree(db, sourceId).map((oldId) => {
				const row = db
					.prepare("SELECT epic_id FROM tasks WHERE id = ?")
					.get(oldId) as { epic_id: string | null };
				return { oldId, oldEpicId: row.epic_id, newId: "", number: 0 };
			});
			for (const node of plan) {
				node.number = allocateNumber(db, target.id);
				node.newId = `${target.prefix}-${node.number}`;
			}

			const newIds = new Map(plan.map((node) => [node.oldId, node.newId]));

			const subtreeIds = plan.map((node) => node.oldId);
			const placeholders = subtreeIds.map(() => "?").join(", ");
			const links = db
				.prepare(
					`SELECT source_task_id, target_task_id, link_type, created_at FROM task_links
					 WHERE source_task_id IN (${placeholders}) OR target_task_id IN (${placeholders})`,
				)
				.all(...subtreeIds, ...subtreeIds) as unknown as {
				source_task_id: string;
				target_task_id: string;
				link_type: string;
				created_at: string;
			}[];
			db.prepare(
				`DELETE FROM task_links
				 WHERE source_task_id IN (${placeholders}) OR target_task_id IN (${placeholders})`,
			).run(...subtreeIds, ...subtreeIds);

			for (const node of plan) {
				const newEpicId =
					node.oldEpicId === null ? null : (newIds.get(node.oldEpicId) ?? null);
				db.prepare(
					`UPDATE tasks
					 SET id = ?, project_id = ?, number = ?, epic_id = ?, scope_id = NULL, updated_at = ?
					 WHERE id = ?`,
				).run(node.newId, target.id, node.number, newEpicId, now, node.oldId);
			}

			const insertLink = db.prepare(
				"INSERT OR IGNORE INTO task_links (source_task_id, target_task_id, link_type, created_at) VALUES (?, ?, ?, ?)",
			);
			for (const link of links) {
				insertLink.run(
					newIds.get(link.source_task_id) ?? link.source_task_id,
					newIds.get(link.target_task_id) ?? link.target_task_id,
					link.link_type,
					link.created_at,
				);
			}

			return withBlockingInfo(db, [taskById(db, newIds.get(sourceId)!)!])[0];
		}),
	);
}
