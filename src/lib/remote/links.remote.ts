import { err, type Result } from "neverthrow";
import { z } from "zod";
import { activityEntry } from "../server/activity";
import {
	addLink as addLinkCore,
	removeLink as removeLinkCore,
	type LinkType,
} from "../server/links";
import { getDb } from "../server/db";
import type { AppError } from "../server/errors";
import * as repo from "../server/tasks";
import type { ActivityChange, Task, TaskWithChanges } from "../types";
import { taskIdSchema } from "#lib/tasks/ids.ts";
import { defineCommand } from "./define";
import { resolveTaskOrThrow } from "./ids";
import { TASK_FIELDS } from "./shape";
import { strictObject } from "./strict";

const SOURCE_ID_DESCRIPTION =
	"Task id of the source task in the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). A bare number is rejected: numbers are unique only inside a project.";

const TARGET_ID_DESCRIPTION =
	"Task id of the target task in the full 'PREFIX-NUMBER' form (e.g. 'LOG-82'). A bare number is rejected: numbers are unique only inside a project.";

const LINK_TYPE_DESCRIPTION =
	"Link type: 'relates_to' is symmetric (one record, visible from both tasks); 'duplicates' is directed (id duplicates target). Blocking uses tasks_add_blocker instead.";

type LinkCommand = (
	db: ReturnType<typeof getDb>,
	sourceId: string,
	targetId: string,
	linkType: LinkType,
) => Result<string, AppError>;

function linkChanges(
	field: "relates_to" | "duplicates",
	before: Task,
	after: Task,
): ActivityChange[] {
	const from = before[field] ?? [];
	const to = after[field] ?? [];
	if (
		from.length === to.length &&
		from.every((id, index) => id === to[index])
	) {
		return [];
	}
	return [{ field, from, to }];
}

function defineLinkOp(options: {
	name: string;
	description: string;
	run: LinkCommand;
}) {
	return defineCommand({
		name: options.name,
		description: options.description,
		kind: "command",
		input: strictObject({
			id: taskIdSchema(SOURCE_ID_DESCRIPTION),
			link_type: z
				.enum(["relates_to", "duplicates"])
				.describe(LINK_TYPE_DESCRIPTION),
			target: taskIdSchema(TARGET_ID_DESCRIPTION),
		}),
		handler: ({ id, link_type, target }) => {
			const db = getDb();
			const sourceId = resolveTaskOrThrow(db, id);
			const targetId = resolveTaskOrThrow(db, target);
			const before = repo.getTask(db, sourceId)!;
			const result = options.run(db, sourceId, targetId, link_type);
			if (result.isErr()) {
				return err(result.error);
			}
			const after = repo.getTask(db, sourceId)!;
			return { ...after, changes: linkChanges(link_type, before, after) };
		},
		activity: (input, task: TaskWithChanges) =>
			activityEntry("task", task.id, [input.link_type], null, task.changes),
	});
}

export const addLink = defineLinkOp({
	name: "tasks_add_link",
	description:
		"Add a typed link between two tasks. link_type 'relates_to' marks the tasks as related (symmetric: visible from both, one record is stored); 'duplicates' marks `id` as a duplicate of `target` (directed). Both ids must use the full 'PREFIX-NUMBER' form; the target may live in another project. A task cannot relate to or duplicate itself, duplicate cycles are rejected. Returns: the updated source task - " +
		TASK_FIELDS +
		" with a changes array describing the link.",
	run: (db, sourceId, targetId, linkType) =>
		addLinkCore(db, linkType, sourceId, targetId),
});

export const removeLink = defineLinkOp({
	name: "tasks_remove_link",
	description:
		"Remove a relates_to or duplicates link between two tasks. Both ids must use the full 'PREFIX-NUMBER' form. If the link does not exist, returns not_found. Returns: the updated source task - " +
		TASK_FIELDS +
		" with a changes array describing the removal.",
	run: (db, sourceId, targetId, linkType) =>
		removeLinkCore(db, linkType, sourceId, targetId),
});
