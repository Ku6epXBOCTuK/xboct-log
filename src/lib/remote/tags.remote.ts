import { z } from "zod";
import { activityEntry, fieldNames } from "../server/activity";
import { getDb } from "../server/db";
import {
	ensureTag,
	renameTag,
	setTagArchived,
	listTags,
	type TagRecord,
} from "../server/tasks";
import { STATUSES } from "../types";
import { tagList, tagRecord } from "./contracts";
import { defineCommand, defineQuery } from "./define";
import { oneOrList } from "./list";
import { strictObject } from "./strict";

export const getTags = defineQuery({
	name: "tags_list",
	output: tagList,
	description:
		"Read the tags in use: every tag with the number of tasks that carry it and the number of open ones. Read-only. Use it before filtering or assigning a tag: the tag list is closed, so tasks_create and tasks_update reject a tag that is not in the dictionary. Archived tags are not listed and cannot be assigned. Accepts the filters project_id and status; soft-deleted tasks are not counted. Returns: {items, total}, where each item is { tag, count, active }, most used first. active counts the tasks that are open, in-progress or blocked: backlog and closed tasks are not counted.",
	kind: "query",
	input: strictObject({
		project_id: oneOrList(z.array(z.string().min(1)).optional()).describe(
			"Count only the tags of these projects. Accepts one id or a list of ids.",
		),
		status: oneOrList(z.array(z.enum(STATUSES)).optional()).describe(
			"Count only the tags of tasks in these statuses. Accepts one status or a list of statuses.",
		),
	}),
	handler: ({ project_id, status }) => {
		const items = listTags(getDb(), { project_id, status });
		return { items, total: items.length };
	},
});

export const createTag = defineCommand({
	name: "tags_create",
	output: tagRecord,
	description:
		"Add a tag to the dictionary. Tags are a closed list: tasks_create and tasks_update accept only names that are in it. Names are trimmed and lowercased. Calling it on an existing tag changes nothing, and an archived tag is restored. Returns: the tag - {name, archived, created_at}.",
	kind: "command",
	input: strictObject({ name: z.string().min(1) }),
	handler: ({ name }) => ensureTag(getDb(), name),
	activity: (input, tag: TagRecord) =>
		activityEntry("tag", tag.name, fieldNames(input)),
});

export const updateTag = defineCommand({
	name: "tags_update",
	output: tagRecord,
	description:
		"Archive or restore a tag by name. An archived tag keeps the tasks that already carry it, but it disappears from tags_list and cannot be assigned again. Returns: the tag - {name, archived, created_at}.",
	kind: "command",
	input: strictObject({
		name: z.string().min(1),
		patch: strictObject({ archived: z.boolean() }),
	}),
	handler: ({ name, patch }) => setTagArchived(getDb(), name, patch.archived),
	activity: (input, tag: TagRecord) =>
		activityEntry("tag", tag.name, fieldNames(input.patch)),
});

export const renameTagCommand = defineCommand({
	name: "tags_rename",
	output: tagRecord,
	description:
		"Rename a tag everywhere: the dictionary entry and every task that carries it. Fails when the new name is already taken. Returns: the tag - {name, archived, created_at}.",
	kind: "command",
	input: strictObject({
		name: z.string().min(1),
		new_name: z.string().min(1),
	}),
	handler: ({ name, new_name }) => renameTag(getDb(), name, new_name),
	activity: (input, tag: TagRecord) =>
		activityEntry("tag", tag.name, ["name"], input.name, [
			{ field: "name", from: input.name, to: tag.name },
		]),
});
