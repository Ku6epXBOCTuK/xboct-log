export type LinkField =
	"relates_to" | "duplicates" | "duplicated_by" | "blocked_by" | "blocks";

export interface TaskLinkDraft {
	blocked_by: string[];
	blocks: string[];
	relates_to: string[];
	duplicates: string[];
	duplicated_by: string[];
}

export function emptyLinkDraft(): TaskLinkDraft {
	return {
		blocked_by: [],
		blocks: [],
		relates_to: [],
		duplicates: [],
		duplicated_by: [],
	};
}

export function hasLinks(draft: TaskLinkDraft): boolean {
	return Object.values(draft).some((ids) => ids.length > 0);
}
