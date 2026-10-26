import {
	DEFAULT_SORT_KEY,
	DEFAULT_SORT_ORDER,
	defaultOrderFor,
	type SortOrder,
	type TaskSortKey,
} from "#lib/tasks/sort.ts";
import {
	CLOSED_STATUSES,
	type Priority,
	type ProjectFilter,
	type Status,
} from "#lib/types.ts";

export function createFilters(initialProject: ProjectFilter) {
	let activeProject = $state<ProjectFilter>(initialProject);
	let status = $state<Status | "all">("all");
	let priority = $state<Priority | "all">("all");
	let hideClosed = $state(true);
	let epic = $state("any");
	let scope = $state<"any" | "none" | number>("any");
	let query = $state("");
	let selectedTags = $state<string[]>([]);
	let sortKey = $state<TaskSortKey>(DEFAULT_SORT_KEY);
	let sortOrder = $state<SortOrder>(DEFAULT_SORT_ORDER);
	let page = $state(1);

	function firstPage() {
		page = 1;
	}

	return {
		get activeProject() {
			return activeProject;
		},
		set activeProject(value: ProjectFilter) {
			activeProject = value;
			firstPage();
		},
		get status() {
			return status;
		},
		set status(value: Status | "all") {
			status = value;
			if (value !== "all" && CLOSED_STATUSES.includes(value)) {
				hideClosed = false;
			}
			firstPage();
		},
		get hideClosed() {
			return hideClosed;
		},
		toggleClosed() {
			hideClosed = !hideClosed;
			firstPage();
		},
		get statusChanged() {
			return status !== "all" || !hideClosed;
		},
		resetStatus() {
			status = "all";
			hideClosed = true;
			firstPage();
		},
		get priority() {
			return priority;
		},
		set priority(value: Priority | "all") {
			priority = value;
			firstPage();
		},
		get priorityChanged() {
			return priority !== "all";
		},
		resetPriority() {
			priority = "all";
			firstPage();
		},
		get epic() {
			return epic;
		},
		set epic(value: string) {
			epic = value;
			firstPage();
		},
		get epicChanged() {
			return epic !== "any";
		},
		resetEpic() {
			epic = "any";
			firstPage();
		},
		get scope() {
			return scope;
		},
		set scope(value: "any" | "none" | number) {
			scope = value;
			firstPage();
		},
		get scopeChanged() {
			return scope !== "any";
		},
		resetScope() {
			scope = "any";
			firstPage();
		},
		get query() {
			return query;
		},
		set query(value: string) {
			query = value;
			firstPage();
		},
		get queryChanged() {
			return query !== "";
		},
		resetQuery() {
			query = "";
			firstPage();
		},
		get selectedTags() {
			return selectedTags;
		},
		toggleTag(tag: string) {
			selectedTags = selectedTags.includes(tag)
				? selectedTags.filter((item) => item !== tag)
				: [...selectedTags, tag];
			firstPage();
		},
		clearTags() {
			selectedTags = [];
			firstPage();
		},
		get tagsChanged() {
			return selectedTags.length > 0;
		},
		get sortKey() {
			return sortKey;
		},
		get sortOrder() {
			return sortOrder;
		},
		setSort(key: TaskSortKey) {
			if (key === sortKey) {
				sortOrder = sortOrder === "asc" ? "desc" : "asc";
			} else {
				sortKey = key;
				sortOrder = defaultOrderFor(key);
			}
			firstPage();
		},
		get page() {
			return page;
		},
		setPage(value: number) {
			page = Math.max(1, value);
		},
		clear() {
			status = "all";
			priority = "all";
			hideClosed = true;
			epic = "any";
			scope = "any";
			query = "";
			selectedTags = [];
			firstPage();
		},
	};
}

export type Filters = ReturnType<typeof createFilters>;
