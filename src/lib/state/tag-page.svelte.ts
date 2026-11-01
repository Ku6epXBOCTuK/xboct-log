import { getContext, setContext } from "svelte";
import type { TagInventoryEntry, TagStore } from "#lib/state/tags.svelte.ts";
import { messageOf } from "#lib/tasks/display.ts";

export function createTagPage(tags: TagStore) {
	let error = $state("");
	let busy = $state("");
	let loaded = $state(false);
	let query = $state("");
	let editing = $state<string | null>(null);

	const all = $derived(tags.inventory);
	const filtered = $derived(
		query.trim() === ""
			? all
			: all.filter((entry) => entry.name.includes(query.trim().toLowerCase())),
	);
	const active = $derived(filtered.filter((entry) => !entry.archived));
	const archived = $derived(filtered.filter((entry) => entry.archived));
	const activeTotal = $derived(all.filter((entry) => !entry.archived).length);
	const archivedTotal = $derived(all.length - activeTotal);

	async function run(key: string, work: () => Promise<unknown>) {
		error = "";
		busy = key;
		try {
			await work();
			return true;
		} catch (cause) {
			error = messageOf(cause);
			return false;
		} finally {
			busy = "";
		}
	}

	return {
		get error() {
			return error;
		},
		get busy() {
			return busy;
		},
		get loaded() {
			return loaded;
		},
		get query() {
			return query;
		},
		setQuery(value: string) {
			query = value;
		},
		get active(): TagInventoryEntry[] {
			return active;
		},
		get archived(): TagInventoryEntry[] {
			return archived;
		},
		get activeTotal() {
			return activeTotal;
		},
		get archivedTotal() {
			return archivedTotal;
		},
		isBusy(name: string) {
			return busy === name;
		},
		isEditing(name: string) {
			return editing === name;
		},
		isLoading() {
			return busy === "load";
		},
		isCreating() {
			return busy === "create";
		},
		startEdit(name: string) {
			editing = name;
		},
		discard() {
			editing = null;
		},
		async create(name: string) {
			return run("create", () => tags.create(name));
		},
		rename(name: string, value: string) {
			editing = null;
			void run(name, () => tags.rename(name, value));
		},
		archive(name: string, archived: boolean) {
			void run(name, () => tags.setArchived(name, archived));
		},
		async reload() {
			await run("load", async () => {
				await tags.refresh();
				loaded = true;
			});
		},
	};
}

export type TagPage = ReturnType<typeof createTagPage>;

const TAG_PAGE_KEY = Symbol("xboct-log:tag-page");

export function provideTagPage(page: TagPage) {
	setContext(TAG_PAGE_KEY, page);
}

export function useTagPage(): TagPage {
	const page = getContext<TagPage | undefined>(TAG_PAGE_KEY);
	if (!page) {
		throw new Error("tag page context is not provided");
	}
	return page;
}
