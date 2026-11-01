import { STATUSES, type Status } from "#lib/types.ts";

export const LIST_SEARCH_KEYS = [
	"tags",
	"status",
	"closed",
	"backlog",
] as const;

export interface ListSearch {
	tags: string[] | null;
	status: Status | null;
	hideClosed: boolean | null;
	hideBacklog: boolean | null;
}

export interface QueryParams {
	get(name: string): string | null;
	getAll(name: string): string[];
}

function flag(params: QueryParams, name: string): boolean | null {
	const raw = params.get(name);
	if (raw === "1") return true;
	if (raw === "0") return false;
	return null;
}

function statusOf(raw: string | null): Status | null {
	return STATUSES.find((status) => status === raw) ?? null;
}

export function parseListSearch(params: QueryParams): ListSearch {
	const tags = [
		...new Set(
			params
				.getAll("tags")
				.flatMap((value) => value.split(","))
				.map((value) => value.trim().toLowerCase())
				.filter((value) => value !== ""),
		),
	];
	const shown = flag(params, "closed");
	const backlog = flag(params, "backlog");

	return {
		tags: tags.length > 0 ? tags : null,
		status: statusOf(params.get("status")),
		hideClosed: shown === null ? null : !shown,
		hideBacklog: backlog === null ? null : !backlog,
	};
}

export function hasListSearch(state: ListSearch): boolean {
	return (
		state.tags !== null ||
		state.status !== null ||
		state.hideClosed !== null ||
		state.hideBacklog !== null
	);
}

export function withoutListSearch(search: string): string {
	const params = new URLSearchParams(search);
	for (const key of LIST_SEARCH_KEYS) {
		params.delete(key);
	}
	const rest = params.toString();
	return rest === "" ? "" : `?${rest}`;
}
