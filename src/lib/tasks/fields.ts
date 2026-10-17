import { CLOSED_STATUSES, type Task } from "#lib/types.ts";

export type TaskPatch = Partial<
	Pick<
		Task,
		| "title"
		| "description"
		| "status"
		| "priority"
		| "is_epic"
		| "epic_id"
		| "scope_id"
		| "source_file"
		| "source_line"
		| "tags"
	>
>;

export type TaskFieldValues = Pick<
	Task,
	| "project_id"
	| "priority"
	| "is_epic"
	| "epic_id"
	| "scope_id"
	| "source_file"
	| "source_line"
	| "tags"
	| "description"
> &
	Partial<Pick<Task, "status" | "closed_at" | "closed_reason" | "updated_at">>;

export function splitTags(raw: string): string[] {
	return raw
		.split(",")
		.map((tag) => tag.trim())
		.filter((tag) => tag !== "");
}

export function toSourceLine(raw: string): number | null {
	const trimmed = raw.trim();
	return trimmed === "" ? null : Number(trimmed);
}

export function toSourceFile(raw: string): string | null {
	const trimmed = raw.trim();
	return trimmed === "" ? null : trimmed;
}

export function validateTaskDraft(draft: {
	title?: string;
	source_file?: string;
	source_line?: string;
}): string | null {
	if (draft.title !== undefined && draft.title.trim() === "") {
		return "title cannot be empty";
	}

	const line =
		draft.source_line === undefined ? null : toSourceLine(draft.source_line);
	if (line !== null && !Number.isInteger(line)) {
		return "source line must be a whole number";
	}

	if (
		line !== null &&
		draft.source_file !== undefined &&
		toSourceFile(draft.source_file) === null
	) {
		return "source line requires source file";
	}

	return null;
}

export function epicsForProject(
	epics: Task[],
	projectId: string,
	keepId: string | null = null,
): Task[] {
	return epics.filter(
		(epic) =>
			epic.project_id === projectId &&
			(!CLOSED_STATUSES.includes(epic.status) || epic.id === keepId),
	);
}

export function siblingEpics(epics: Task[], selected: Task | null): Task[] {
	if (selected === null) return [];

	return epicsForProject(epics, selected.project_id, selected.epic_id).filter(
		(epic) => epic.id !== selected.id,
	);
}
