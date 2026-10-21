import { CLOSED_STATUSES, type ProjectFilter, type Task } from "#lib/types.ts";

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
	| "tags"
	| "description"
> &
	Partial<Pick<Task, "status" | "closed_at" | "closed_reason" | "updated_at">>;

export function toSourceFile(raw: string): string | null {
	const trimmed = raw.trim();
	return trimmed === "" ? null : trimmed;
}

export function validateTaskDraft(draft: {
	title?: string;
	source_file?: string;
}): string | null {
	if (draft.title !== undefined && draft.title.trim() === "") {
		return "title cannot be empty";
	}

	return null;
}

export function epicsForProject(
	epics: Task[],
	projectId: ProjectFilter,
	keepId: string | null = null,
): Task[] {
	return epics.filter(
		(epic) =>
			(projectId === null || epic.project_id === projectId) &&
			(!CLOSED_STATUSES.includes(epic.status) || epic.id === keepId),
	);
}

export function siblingEpics(epics: Task[], selected: Task | null): Task[] {
	if (selected === null) return [];

	return epicsForProject(epics, selected.project_id, selected.epic_id).filter(
		(epic) => epic.id !== selected.id,
	);
}
