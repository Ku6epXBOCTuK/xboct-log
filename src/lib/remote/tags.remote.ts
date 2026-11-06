import { z } from "zod";
import { activityEntry, fieldNames } from "../server/activity";
import { getDb } from "../server/db";
import {
	ensureTag,
	renameTag,
	setTagArchived,
	listDictionary,
	listTagInventory,
	listTags,
	type TagRecord,
} from "../server/tasks";
import { STATUSES } from "../types";
import { idList, tagInventoryList, tagList, tagRecord } from "./contracts";
import { defineCommand, defineQuery } from "./define";
import { flatPatch } from "./flat";
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

export const getTagDictionary = defineQuery({
	name: "tags_dictionary",
	output: idList,
	description:
		"List every tag name in the dictionary, including the tags that no task carries yet. Archived tags are excluded: they cannot be assigned. Use tags_list for the counts of the tags in use. Returns: {items} - the tag names, sorted by name.",
	kind: "query",
	input: strictObject({}),
	handler: () => ({
		items: listDictionary(getDb())
			.filter((tag) => !tag.archived)
			.map((tag) => tag.name),
	}),
});

export const listTagInventoryQuery = defineQuery({
	name: "tags_inventory",
	output: tagInventoryList,
	description:
		"The whole tag dictionary including the archived tags and the tags no task carries, with usage counts. Counts soft-deleted tasks out. Archived tags stay on the tasks that already carry them but cannot be assigned again. `active` counts open, in-progress and blocked tasks, `backlog` counts the backlog ones. Returns: {items, total}, where each item is {name, archived, created_at, count, active, backlog}.",
	kind: "query",
	mcp: false,
	input: strictObject({}),
	handler: () => {
		const items = listTagInventory(getDb());
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

const updateTagInput = strictObject({
	name: z.string().min(1),
	patch: strictObject({ archived: z.boolean() }),
});

const flatUpdateTag = flatPatch(updateTagInput);

export const updateTag = defineCommand({
	name: "tags_update",
	output: tagRecord,
	description:
		"Archive or restore a tag by name: pass archived next to name (e.g. {name: 'design', archived: true}); a nested patch object is accepted too. An archived tag keeps the tasks that already carry it, but it disappears from tags_list and cannot be assigned again. Returns: the tag - {name, archived, created_at}.",
	kind: "command",
	input: updateTagInput,
	mcpInput: flatUpdateTag.input,
	mcpNormalize: flatUpdateTag.normalize,
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
		activityEntry(
			"tag",
			tag.name,
			["name"],
			[{ field: "name", from: input.name, to: tag.name }],
		),
});
