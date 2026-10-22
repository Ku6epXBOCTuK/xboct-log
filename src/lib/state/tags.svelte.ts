import { fetchFresh } from "#lib/remote/fresh.ts";
import { getTags } from "#lib/remote/tags.remote.ts";

export interface TagEntry {
	tag: string;
	count: number;
	active: number;
}

export interface TagUsage {
	tag: string;
	count: number;
}

export function createTagStore(initial: TagEntry[]) {
	let entries = $state<TagEntry[]>(initial);

	return {
		get all() {
			return entries;
		},
		replaceAll(next: TagEntry[]) {
			entries = next;
		},
		async refresh() {
			const { items } = await fetchFresh(getTags({}));
			entries = items;
		},
		ranked(local: TagUsage[]): TagEntry[] {
			const localCount: Record<string, number> = {};
			for (const item of local) {
				localCount[item.tag] = item.count;
			}
			return entries
				.filter((entry) => entry.active > 0)
				.slice()
				.sort((left, right) => {
					const byProject =
						(localCount[right.tag] ?? 0) - (localCount[left.tag] ?? 0);
					if (byProject !== 0) return byProject;
					if (right.count !== left.count) return right.count - left.count;
					return left.tag.localeCompare(right.tag);
				});
		},
	};
}

export type TagStore = ReturnType<typeof createTagStore>;
