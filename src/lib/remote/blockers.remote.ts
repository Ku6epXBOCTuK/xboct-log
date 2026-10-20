import { error } from "@sveltejs/kit";
import { z } from "zod";
import { getDb } from "../server/db";
import {
	addBlocker as addBlockerLink,
	removeBlocker as removeBlockerLink,
} from "../server/blockers";
import * as repo from "../server/tasks";
import { defineCommand } from "./define";

const BLOCKING_ID_DESCRIPTION =
	"Task id of the blocking task. The full 'PREFIX-NUMBER' form (e.g. 'LOG-82') always resolves. A bare task number (e.g. '82') is resolved inside in_project when it is given, otherwise it must be unique across the whole backlog.";

const BLOCKED_ID_DESCRIPTION =
	"Task id of the blocked task. The full 'PREFIX-NUMBER' form (e.g. 'LOG-82') always resolves. A bare task number (e.g. '82') is resolved inside in_project when it is given, otherwise it must be unique across the whole backlog.";

const IN_PROJECT_DESCRIPTION =
	"Optional project id (e.g. 'eit') that scopes the id lookups: a bare task number is then looked up inside that project. With a full id, the project must match, else the call fails.";

function resolveId(
	db: ReturnType<typeof getDb>,
	id: string,
	inProject?: string,
) {
	const resolved = repo.resolveTaskId(db, id, inProject);
	if (resolved.isErr()) {
		error(resolved.error.status, resolved.error.message);
	}
	return resolved.value;
}

export const addBlocker = defineCommand({
	name: "tasks_add_blocker",
	description:
		"Link two tasks: the task `id` becomes blocked by the task `blocked_by` (that is the blocker). Both ids accept the full 'PREFIX-NUMBER' form or a bare task number; bare numbers are resolved inside in_project when it is given, otherwise they must be unique across the whole backlog. The blocker may live in another project. A task cannot block itself and cycles are rejected. The blocked task keeps its current status: set status 'blocked' with tasks_update yourself. Returns the updated blocked task with its blocked_by and blocks lists.",
	kind: "command",
	input: z.object({
		id: z.string().min(1).describe(BLOCKED_ID_DESCRIPTION),
		blocked_by: z.string().min(1).describe(BLOCKING_ID_DESCRIPTION),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ id, blocked_by, in_project }) => {
		const db = getDb();
		const blockedId = resolveId(db, id, in_project);
		const blockerId = resolveId(db, blocked_by, in_project);
		const result = addBlockerLink(db, blockerId, blockedId);
		if (result.isErr()) {
			error(result.error.status, result.error.message);
		}
		return repo.getTask(db, blockedId)!;
	},
});

export const removeBlocker = defineCommand({
	name: "tasks_remove_blocker",
	description:
		"Remove a blocking link: the task `id` is no longer blocked by the task `blocked_by`. Both ids accept the full 'PREFIX-NUMBER' form or a bare task number; bare numbers are resolved inside in_project when it is given, otherwise they must be unique across the whole backlog. If no open blocker remains, the blocked task goes from status 'blocked' back to 'open'. Returns the updated blocked task with its blocked_by and blocks lists.",
	kind: "command",
	input: z.object({
		id: z.string().min(1).describe(BLOCKED_ID_DESCRIPTION),
		blocked_by: z.string().min(1).describe(BLOCKING_ID_DESCRIPTION),
		in_project: z.string().min(1).optional().describe(IN_PROJECT_DESCRIPTION),
	}),
	handler: ({ id, blocked_by, in_project }) => {
		const db = getDb();
		const blockedId = resolveId(db, id, in_project);
		const blockerId = resolveId(db, blocked_by, in_project);
		const result = removeBlockerLink(db, blockerId, blockedId);
		if (result.isErr()) {
			error(result.error.status, result.error.message);
		}
		return repo.getTask(db, blockedId)!;
	},
});
