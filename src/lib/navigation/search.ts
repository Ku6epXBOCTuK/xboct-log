import { STATUSES, type Status } from "#lib/types.ts";

export const LIST_SEARCH_KEYS = ["tags", "status"] as const;

export interface ListSearch {
	tags: string[] | null;
	statuses: Status[] | null;
}

export interface QueryParams {
	get(name: string): string | null;
	getAll(name: string): string[];
}

function statusesOf(params: QueryParams): Status[] | null {
	const values = params
		.getAll("status")
		.flatMap((value) => value.split(","))
		.map((value) => value.trim().toLowerCase());
	const known = STATUSES.filter((status) => values.includes(status));
	return known.length > 0 ? known : null;
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

	return {
		tags: tags.length > 0 ? tags : null,
		statuses: statusesOf(params),
	};
}

export function hasListSearch(state: ListSearch): boolean {
	return state.tags !== null || state.statuses !== null;
}

export function withoutListSearch(search: string): string {
	const params = new URLSearchParams(search);
	for (const key of LIST_SEARCH_KEYS) {
		params.delete(key);
	}
	const rest = params.toString();
	return rest === "" ? "" : `?${rest}`;
}
