import { fetchFresh } from "#lib/api/fresh.ts";
import {
	createTag,
	getTagDictionary,
	getTags,
	listTagInventoryQuery,
	renameTagCommand,
	updateTag,
} from "#lib/api/workspace/tags.ts";
import { data } from "#lib/data/data.svelte.ts";

export interface TagEntry {
	tag: string;
	count: number;
	active: number;
}

export interface TagInventoryEntry {
	name: string;
	archived: boolean;
	created_at: string;
	count: number;
	active: number;
	backlog: number;
}

export interface TagPicker {
	suggestions: string[];
	counts: Record<string, number>;
}

function countOf(counts: Record<string, number>, tag: string): number {
	return Object.hasOwn(counts, tag) ? counts[tag] : 0;
}

function byCount(
	left: string,
	right: string,
	counts: Record<string, number>,
): number {
	const difference = countOf(counts, right) - countOf(counts, left);
	return difference !== 0 ? difference : left.localeCompare(right);
}

export function createTagStore(initial: TagEntry[], initialNames: string[]) {
	const entries = data.cell<TagEntry[]>("tags:entries", initial);
	const names = data.cell<string[]>("tags:dictionary", initialNames);
	const inventory = data.cell<TagInventoryEntry[]>("tags:inventory", []);

	async function load() {
		await data.load(
			"tags",
			async () =>
				Promise.all([
					fetchFresh(getTags({})),
					fetchFresh(getTagDictionary({})),
					fetchFresh(listTagInventoryQuery({})),
				]),
			([ranked, dictionary, full]) => {
				entries.set(ranked.items);
				names.set(dictionary.items);
				inventory.set(full.items);
			},
			true,
		);
	}

	function ordered(scope: TagEntry[]): string[] {
		const scopedCounts = Object.fromEntries(
			scope.map((entry) => [entry.tag, entry.count]),
		);
		const globalCounts = Object.fromEntries(
			entries.value.map((entry) => [entry.tag, entry.count]),
		);
		const scoped = Object.keys(scopedCounts).sort((left, right) =>
			byCount(left, right, scopedCounts),
		);
		const rest = [...names.value, ...Object.keys(globalCounts)]
			.filter((tag) => !Object.hasOwn(scopedCounts, tag))
			.filter((tag, index, all) => all.indexOf(tag) === index)
			.sort((left, right) => byCount(left, right, globalCounts));
		return [...scoped, ...rest];
	}

	function picker(scope: TagEntry[]): TagPicker {
		return {
			suggestions: ordered(scope),
			counts: Object.fromEntries(
				scope.map((entry) => [entry.tag, entry.count]),
			),
		};
	}

	return {
		get all() {
			return entries.value;
		},
		get dictionary() {
			return names.value;
		},
		get inventory() {
			return inventory.value;
		},
		async refresh() {
			await load();
		},
		async create(name: string) {
			await createTag({ name });
			await load();
		},
		async setArchived(name: string, archived: boolean) {
			await updateTag({ name, patch: { archived } });
			await load();
		},
		async rename(name: string, newName: string) {
			await renameTagCommand({ name, new_name: newName });
			await load();
		},
		picker,
	};
}

export type TagStore = ReturnType<typeof createTagStore>;
