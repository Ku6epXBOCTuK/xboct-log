import { fetchFresh } from "#lib/remote/fresh.ts";
import {
	createTag,
	getTagDictionary,
	getTags,
	listTagInventoryQuery,
	renameTagCommand,
	updateTag,
} from "#lib/remote/tags.remote.ts";

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
	let entries = $state<TagEntry[]>(initial);
	let names = $state<string[]>(initialNames);
	let inventory = $state<TagInventoryEntry[]>([]);

	async function load() {
		const [ranked, dictionary, full] = await Promise.all([
			fetchFresh(getTags({})),
			fetchFresh(getTagDictionary({})),
			fetchFresh(listTagInventoryQuery({})),
		]);
		entries = ranked.items;
		names = dictionary.items;
		inventory = full.items;
	}

	function ordered(scope: TagEntry[]): string[] {
		const scopedCounts = Object.fromEntries(
			scope.map((entry) => [entry.tag, entry.count]),
		);
		const globalCounts = Object.fromEntries(
			entries.map((entry) => [entry.tag, entry.count]),
		);
		const scoped = Object.keys(scopedCounts).sort((left, right) =>
			byCount(left, right, scopedCounts),
		);
		const rest = [...names, ...Object.keys(globalCounts)]
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
			return entries;
		},
		get dictionary() {
			return names;
		},
		get inventory() {
			return inventory;
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
