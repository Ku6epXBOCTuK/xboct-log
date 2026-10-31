import { fetchFresh } from "#lib/remote/fresh.ts";
import {
	createTag,
	getTagDictionary,
	getTags,
} from "#lib/remote/tags.remote.ts";

export interface TagEntry {
	tag: string;
	count: number;
	active: number;
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

	async function load() {
		const [ranked, dictionary] = await Promise.all([
			fetchFresh(getTags({})),
			fetchFresh(getTagDictionary({})),
		]);
		entries = ranked.items;
		names = dictionary.items;
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
		async refresh() {
			await load();
		},
		async create(name: string) {
			await createTag({ name });
			await load();
		},
		picker,
	};
}

export type TagStore = ReturnType<typeof createTagStore>;
