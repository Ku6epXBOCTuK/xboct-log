import { error } from "@sveltejs/kit";
import { activityEntry } from "../server/activity";
import {
	addBlocker as addBlockerLink,
	removeBlocker as removeBlockerLink,
} from "../server/blockers";
import { getDb } from "../server/db";
import * as repo from "../server/tasks";
import type { ActivityChange, Task, TaskWithChanges } from "../types";
import { taskIdSchema } from "#lib/tasks/ids.ts";
import { defineCommand } from "./define";
import { strictObject } from "./strict";

const BLOCKING_ID_DESCRIPTION =
	"Task id of the blocking task in the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). A bare number is rejected: numbers are unique only inside a project.";

const BLOCKED_ID_DESCRIPTION =
	"Task id of the blocked task in the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). A bare number is rejected: numbers are unique only inside a project.";

function resolveId(db: ReturnType<typeof getDb>, id: string) {
	const resolved = repo.resolveTaskId(db, id);
	if (resolved.isErr()) {
		error(resolved.error.status, resolved.error.message);
	}
	return resolved.value;
}

function linkChanges(before: Task, after: Task): ActivityChange[] {
	const changes: ActivityChange[] = [];
	const from = before.blocked_by ?? [];
	const to = after.blocked_by ?? [];
	if (from.length !== to.length || from.some((id, index) => id !== to[index])) {
		changes.push({ field: "blocked_by", from, to });
	}
	if (before.status !== after.status) {
		changes.push({ field: "status", from: before.status, to: after.status });
	}
	return changes;
}

export const addBlocker = defineCommand({
	name: "tasks_add_blocker",
	description:
		"Link two tasks: the task `id` becomes blocked by the task `blocked_by` (that is the blocker). Both ids must use the full 'PREFIX-NUMBER' form. The blocker may live in another project. A task cannot block itself and cycles are rejected. The blocked task keeps its current status: set status 'blocked' with tasks_update yourself. Returns the updated blocked task with its blocked_by and blocks lists and a changes array describing the link.",
	kind: "command",
	input: strictObject({
		id: taskIdSchema(BLOCKED_ID_DESCRIPTION),
		blocked_by: taskIdSchema(BLOCKING_ID_DESCRIPTION),
	}),
	handler: ({ id, blocked_by }) => {
		const db = getDb();
		const blockedId = resolveId(db, id);
		const blockerId = resolveId(db, blocked_by);
		const before = repo.getTask(db, blockedId)!;
		const result = addBlockerLink(db, blockerId, blockedId);
		if (result.isErr()) {
			error(result.error.status, result.error.message);
		}
		const after = repo.getTask(db, blockedId)!;
		return { ...after, changes: linkChanges(before, after) };
	},
	activity: (_input, task: TaskWithChanges) =>
		activityEntry("task", task.id, ["blocked_by"], null, task.changes),
});

export const removeBlocker = defineCommand({
	name: "tasks_remove_blocker",
	description:
		"Remove a blocking link: the task `id` is no longer blocked by the task `blocked_by`. Both ids must use the full 'PREFIX-NUMBER' form. If no open blocker remains, the blocked task leaves status 'blocked' and returns to the status it had before it was blocked ('open' when that status is unknown). Returns the updated blocked task with its blocked_by and blocks lists and a changes array describing the link and the status release.",
	kind: "command",
	input: strictObject({
		id: taskIdSchema(BLOCKED_ID_DESCRIPTION),
		blocked_by: taskIdSchema(BLOCKING_ID_DESCRIPTION),
	}),
	handler: ({ id, blocked_by }) => {
		const db = getDb();
		const blockedId = resolveId(db, id);
		const blockerId = resolveId(db, blocked_by);
		const before = repo.getTask(db, blockedId)!;
		const result = removeBlockerLink(db, blockerId, blockedId);
		if (result.isErr()) {
			error(result.error.status, result.error.message);
		}
		const after = repo.getTask(db, blockedId)!;
		return { ...after, changes: linkChanges(before, after) };
	},
	activity: (_input, task: TaskWithChanges) =>
		activityEntry("task", task.id, ["blocked_by"], null, task.changes),
});
