import type { Filters } from "#lib/state/filters.svelte.ts";
import { TASK_PAGE_SIZE } from "#lib/tasks/paging.ts";
import { parseSearchQuery } from "#lib/tasks/search.ts";
import type { TaskSortKey } from "#lib/tasks/sort.ts";
import {
	CLOSED_STATUSES,
	STATUSES,
	type Priority,
	type Status,
} from "#lib/types.ts";

type ServerSort =
	| "updated_at"
	| "created_at"
	| "closed_at"
	| "priority"
	| "status"
	| "project"
	| "number";

const SERVER_SORT: Record<TaskSortKey, ServerSort> = {
	priority: "priority",
	status: "status",
	created: "created_at",
	updated: "updated_at",
	closed: "closed_at",
	project: "project",
	id: "number",
};

export interface TaskQueryArgs {
	project_id?: string;
	status?: Status[];
	priority?: Priority[];
	tag?: string[];
	is_epic?: boolean;
	epic_id?: string;
	scope_id?: number | null;
	has_epic?: boolean;
	q_any?: string[];
	number_exact?: number[];
	id_exact?: string[];
	sort: ServerSort;
	order: "asc" | "desc";
	limit: number;
	offset: number;
	include_description: true;
}

function statuses(filters: Filters): Status[] | undefined {
	if (filters.status !== "all") return [filters.status];
	if (!filters.hideClosed) return undefined;
	return STATUSES.filter((status) => !CLOSED_STATUSES.includes(status));
}

function addSearch(args: TaskQueryArgs, input: string): void {
	const terms = parseSearchQuery(input);
	const text = terms.flatMap((term) =>
		term.kind === "text" ? [term.text] : [],
	);
	const numbers = terms.flatMap((term) =>
		term.kind === "number" ? [term.number] : [],
	);
	const ids = terms.flatMap((term) => (term.kind === "id" ? [term.id] : []));

	if (text.length > 0) args.q_any = text;
	if (numbers.length > 0) args.number_exact = numbers;
	if (ids.length > 0) args.id_exact = ids;
}

export function buildTaskQuery(
	filters: Filters,
	page = filters.page,
	pageSize = TASK_PAGE_SIZE,
): TaskQueryArgs {
	const args: TaskQueryArgs = {
		sort: SERVER_SORT[filters.sortKey],
		order: filters.sortOrder,
		limit: pageSize,
		offset: (page - 1) * pageSize,
		include_description: true,
	};

	if (filters.activeProject !== null) {
		args.project_id = filters.activeProject;
	}

	const status = statuses(filters);
	if (status !== undefined) {
		args.status = status;
	}

	if (filters.priority !== "all") {
		args.priority = [filters.priority];
	}

	if (filters.epic === "none") {
		args.has_epic = false;
	} else if (filters.epic === "only") {
		args.is_epic = true;
	} else if (filters.epic === "inside") {
		args.has_epic = true;
	} else if (filters.epic !== "any") {
		args.epic_id = filters.epic;
	}

	if (filters.scope === "none") {
		args.scope_id = null;
	} else if (typeof filters.scope === "number") {
		args.scope_id = filters.scope;
	}

	if (filters.selectedTags.length > 0) {
		args.tag = [...filters.selectedTags];
	}

	addSearch(args, filters.query);

	return args;
}
