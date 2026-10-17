import { filterTasks } from "#lib/tasks/filter.ts";
import type { Priority, Status, Task } from "#lib/types.ts";

export function createFilters(initialProject: string) {
	let activeProject = $state(initialProject);
	let status = $state<Status | "all">("all");
	let priority = $state<Priority | "all">("all");
	let epic = $state("any");
	let scope = $state<"any" | "none" | number>("any");
	let query = $state("");
	let selectedTags = $state<string[]>([]);

	return {
		get activeProject() {
			return activeProject;
		},
		set activeProject(value: string) {
			activeProject = value;
		},
		get status() {
			return status;
		},
		set status(value: Status | "all") {
			status = value;
		},
		get priority() {
			return priority;
		},
		set priority(value: Priority | "all") {
			priority = value;
		},
		get epic() {
			return epic;
		},
		set epic(value: string) {
			epic = value;
		},
		get scope() {
			return scope;
		},
		set scope(value: "any" | "none" | number) {
			scope = value;
		},
		get query() {
			return query;
		},
		set query(value: string) {
			query = value;
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
		clear() {
			status = "all";
			priority = "all";
			epic = "any";
			scope = "any";
			query = "";
			selectedTags = [];
		},
		visible(tasks: Task[]) {
			return filterTasks(tasks, {
				activeProject,
				status,
				priority,
				epic,
				scope,
				selectedTags,
				query,
			});
		},
	};
}

export type Filters = ReturnType<typeof createFilters>;
