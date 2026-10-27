import { fetchFresh } from "#lib/remote/fresh.ts";
import { createTag, getTags } from "#lib/remote/tags.remote.ts";

export interface TagEntry {
	tag: string;
	count: number;
	active: number;
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
		async create(name: string) {
			await createTag({ name });
			const { items } = await fetchFresh(getTags({}));
			entries = items;
		},
		ordered(entries: TagEntry[]): TagEntry[] {
			return entries
				.filter((entry) => entry.active > 0)
				.slice()
				.sort((left, right) => {
					if (right.count !== left.count) return right.count - left.count;
					return left.tag.localeCompare(right.tag);
				});
		},
	};
}

export type TagStore = ReturnType<typeof createTagStore>;
