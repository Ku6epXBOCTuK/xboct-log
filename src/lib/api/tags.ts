import type { TagCount, TagInventoryEntry, TagRecord } from "#lib/api/types.ts";
import type { Status } from "#lib/types.ts";
import { client, unwrap } from "./client.ts";

export type TagsPage = { items: TagCount[]; total: number };

export async function getTags(
	input: { project_id?: string | string[]; status?: Status | Status[] } = {},
): Promise<TagsPage> {
	return unwrap<TagsPage>(
		await client.POST("/api/tags_list", { body: input as never }),
	);
}

export async function getTagDictionary(
	input: Record<string, never> = {},
): Promise<{ items: string[] }> {
	return unwrap<{ items: string[] }>(
		await client.POST("/api/tags_dictionary", { body: input }),
	);
}

export type TagInventoryPage = {
	items: TagInventoryEntry[];
	total: number;
};

export async function listTagInventoryQuery(
	input: Record<string, never> = {},
): Promise<TagInventoryPage> {
	return unwrap<TagInventoryPage>(
		await client.POST("/api/tags_inventory", { body: input }),
	);
}

export async function createTag(input: { name: string }): Promise<TagRecord> {
	return unwrap<TagRecord>(
		await client.POST("/api/tags_create", { body: input }),
	);
}

export async function updateTag(input: {
	name: string;
	patch: { archived: boolean };
}): Promise<TagRecord> {
	return unwrap<TagRecord>(
		await client.POST("/api/tags_update", { body: input }),
	);
}

export async function renameTagCommand(input: {
	name: string;
	new_name: string;
}): Promise<TagRecord> {
	return unwrap<TagRecord>(
		await client.POST("/api/tags_rename", { body: input }),
	);
}
