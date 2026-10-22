import { filterTasks } from "#lib/tasks/filter.ts";
import {
	DEFAULT_SORT_KEY,
	DEFAULT_SORT_ORDER,
	defaultOrderFor,
	sortTasks,
	type SortContext,
	type SortOrder,
	type TaskSortKey,
} from "#lib/tasks/sort.ts";
import {
	CLOSED_STATUSES,
	type Priority,
	type ProjectFilter,
	type Status,
	type Task,
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

	return {
		get activeProject() {
			return activeProject;
		},
		set activeProject(value: ProjectFilter) {
			activeProject = value;
		},
		get status() {
			return status;
		},
		set status(value: Status | "all") {
			status = value;
			if (value !== "all" && CLOSED_STATUSES.includes(value)) {
				hideClosed = false;
			}
		},
		get hideClosed() {
			return hideClosed;
		},
		toggleClosed() {
			hideClosed = !hideClosed;
		},
		get statusChanged() {
			return status !== "all" || !hideClosed;
		},
		resetStatus() {
			status = "all";
			hideClosed = true;
		},
		get priority() {
			return priority;
		},
		set priority(value: Priority | "all") {
			priority = value;
		},
		get priorityChanged() {
			return priority !== "all";
		},
		resetPriority() {
			priority = "all";
		},
		get epic() {
			return epic;
		},
		set epic(value: string) {
			epic = value;
		},
		get epicChanged() {
			return epic !== "any";
		},
		resetEpic() {
			epic = "any";
		},
		get scope() {
			return scope;
		},
		set scope(value: "any" | "none" | number) {
			scope = value;
		},
		get scopeChanged() {
			return scope !== "any";
		},
		resetScope() {
			scope = "any";
		},
		get query() {
			return query;
		},
		set query(value: string) {
			query = value;
		},
		get queryChanged() {
			return query !== "";
		},
		resetQuery() {
			query = "";
		},
		get selectedTags() {
			return selectedTags;
		},
		toggleTag(tag: string) {
			selectedTags = selectedTags.includes(tag)
				? selectedTags.filter((item) => item !== tag)
				: [...selectedTags, tag];
		},
		clearTags() {
			selectedTags = [];
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
				return;
			}
			sortKey = key;
			sortOrder = defaultOrderFor(key);
		},
		clear() {
			status = "all";
			priority = "all";
			hideClosed = true;
			epic = "any";
			scope = "any";
			query = "";
			selectedTags = [];
		},
		visible(tasks: Task[], context: SortContext = {}) {
			return sortTasks(
				filterTasks(tasks, {
					activeProject,
					status,
					priority,
					hideClosed,
					epic,
					scope,
					selectedTags,
					query,
				}),
				sortKey,
				sortOrder,
				context,
			);
		},
	};
}

export type Filters = ReturnType<typeof createFilters>;
