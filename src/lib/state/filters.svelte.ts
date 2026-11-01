import {
	DEFAULT_SORT_KEY,
	DEFAULT_SORT_ORDER,
	defaultOrderFor,
	type SortOrder,
	type TaskSortKey,
} from "#lib/tasks/sort.ts";
import {
	DEFAULT_STATUSES,
	STATUSES,
	type Priority,
	type ProjectFilter,
	type Status,
} from "#lib/types.ts";

function ordered(statuses: readonly Status[]): Status[] {
	return STATUSES.filter((status) => statuses.includes(status));
}

function sameSet(left: readonly Status[], right: readonly Status[]): boolean {
	return (
		left.length === right.length &&
		left.every((status) => right.includes(status))
	);
}

export function createFilters(initialProject: ProjectFilter) {
	let activeProject = $state<ProjectFilter>(initialProject);
	let statuses = $state<Status[]>([...DEFAULT_STATUSES]);
	let priority = $state<Priority | "all">("all");
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
		get statuses() {
			return statuses;
		},
		setStatuses(value: Status[]) {
			const next = ordered(value);
			statuses = next.length > 0 ? next : [...DEFAULT_STATUSES];
			firstPage();
		},
		pickStatus(value: Status) {
			statuses =
				statuses.length === 1 && statuses[0] === value
					? [...DEFAULT_STATUSES]
					: [value];
			firstPage();
		},
		toggleStatus(value: Status) {
			const next = statuses.includes(value)
				? statuses.filter((status) => status !== value)
				: [...statuses, value];
			if (next.length === 0) return;
			statuses = ordered(next);
			firstPage();
		},
		get statusChanged() {
			return !sameSet(statuses, DEFAULT_STATUSES);
		},
		resetStatus() {
			statuses = [...DEFAULT_STATUSES];
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
		setTags(names: string[]) {
			selectedTags = names.filter(
				(name, index) => names.indexOf(name) === index,
			);
			firstPage();
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
			statuses = [...DEFAULT_STATUSES];
			priority = "all";
			epic = "any";
			scope = "any";
			query = "";
			selectedTags = [];
			firstPage();
		},
	};
}

export type Filters = ReturnType<typeof createFilters>;
