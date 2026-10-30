import { err, type Result } from "neverthrow";
import type { ZodType } from "zod";
import { activityEntry } from "../server/activity";
import {
	addBlocker as addBlockerLink,
	removeBlocker as removeBlockerLink,
} from "../server/links";
import { getDb } from "../server/db";
import type { AppError } from "../server/errors";
import * as repo from "../server/tasks";
import type { ActivityChange, Task, TaskWithChanges } from "../types";
import { taskIdSchema } from "#lib/tasks/ids.ts";
import { taskRef } from "./contracts";
import { defineCommand } from "./define";
import { resolveTaskOrThrow } from "./ids";
import { TASK_FIELDS } from "./shape";
import { strictObject } from "./strict";

const BLOCKING_ID_DESCRIPTION =
	"Task id of the blocking task in the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). A bare number is rejected: numbers are unique only inside a project.";

const BLOCKED_ID_DESCRIPTION =
	"Task id of the blocked task in the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). A bare number is rejected: numbers are unique only inside a project.";

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

type LinkCommand = (
	db: ReturnType<typeof getDb>,
	blockerId: string,
	blockedId: string,
) => Result<string, AppError>;

function defineBlockerLinkOp(options: {
	name: string;
	description: string;
	output: ZodType;
	run: LinkCommand;
}) {
	return defineCommand({
		name: options.name,
		description: options.description,
		kind: "command",
		output: options.output,
		input: strictObject({
			task_id: taskIdSchema(BLOCKED_ID_DESCRIPTION),
			blocked_by: taskIdSchema(BLOCKING_ID_DESCRIPTION),
		}),
		handler: ({ task_id, blocked_by }) => {
			const db = getDb();
			const blockedId = resolveTaskOrThrow(db, task_id);
			const blockerId = resolveTaskOrThrow(db, blocked_by);
			const before = repo.getTask(db, blockedId)!;
			const result = options.run(db, blockerId, blockedId);
			if (result.isErr()) {
				return err(result.error);
			}
			const after = repo.getTask(db, blockedId)!;
			return { ...after, changes: linkChanges(before, after) };
		},
		activity: (_input, task: TaskWithChanges) =>
			activityEntry("task", task.id, ["blocked_by"], null, task.changes),
	});
}

export const addBlocker = defineBlockerLinkOp({
	name: "tasks_add_blocker",
	output: taskRef,
	description:
		"Link two tasks: the task `task_id` becomes blocked by the task `blocked_by` (that is the blocker). Both ids use the full task id form 'PREFIX-NUMBER'. The blocker may live in another project. A task cannot block itself and cycles are rejected. The blocked task keeps its current status: set status 'blocked' with tasks_update yourself. The link is history and stays after the blocker is closed or the task is released, so never remove it for cleanup. Returns: the updated blocked task - " +
		TASK_FIELDS +
		" with a changes array describing the link.",
	run: addBlockerLink,
});

export const removeBlocker = defineBlockerLinkOp({
	name: "tasks_remove_blocker",
	output: taskRef,
	description:
		"Remove a blocking link that was recorded by mistake: the task `task_id` is no longer blocked by the task `blocked_by`. Both ids use the full task id form 'PREFIX-NUMBER'. A closed blocker and a task that already left status 'blocked' are not reasons to remove the link: it is the history of the wait and must stay in blocked_by. If no open blocker remains, the blocked task leaves status 'blocked' and returns to the status it had before it was blocked ('open' when that status is unknown). Returns: the updated blocked task - " +
		TASK_FIELDS +
		" with a changes array describing the link and the status release.",
	run: removeBlockerLink,
});
