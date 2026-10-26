import {
	CLOSED_STATUSES,
	type Project,
	type ProjectFilter,
	type Scope,
	type Task,
} from "#lib/types.ts";

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
		| "estimate"
		| "assignee"
		| "due_at"
		| "blocked_reason"
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
	| "estimate"
	| "assignee"
	| "due_at"
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

export function draftHasContent(
	values: TaskFieldValues,
	title: string,
): boolean {
	return (
		title.trim() !== "" ||
		values.description.trim() !== "" ||
		values.tags.some((tag) => tag.trim() !== "") ||
		advancedFilledCount(values) > 0
	);
}

export function fitDraftToProjects(
	values: TaskFieldValues,
	projects: Project[],
	epics: Task[],
	scopes: Scope[],
	fallbackProject: string,
): TaskFieldValues {
	const projectId = projects.some((project) => project.id === values.project_id)
		? values.project_id
		: fallbackProject;
	const kept = projectId === values.project_id;
	const epicId =
		kept &&
		!values.is_epic &&
		values.epic_id !== null &&
		epics.some(
			(epic) => epic.id === values.epic_id && epic.project_id === projectId,
		)
			? values.epic_id
			: null;
	const scopeId =
		kept &&
		values.scope_id !== null &&
		scopes.some(
			(scope) => scope.id === values.scope_id && scope.project_id === projectId,
		)
			? values.scope_id
			: null;

	return {
		...values,
		project_id: projectId,
		epic_id: epicId,
		scope_id: scopeId,
	};
}

export function advancedFilledCount(values: TaskFieldValues): number {
	let count = 0;
	if (values.estimate !== null && values.estimate !== undefined) count += 1;
	if (values.due_at !== null && values.due_at !== undefined) count += 1;
	if (values.assignee !== null && values.assignee !== undefined) count += 1;
	if (values.source_file !== null && values.source_file !== undefined)
		count += 1;
	if (values.is_epic) count += 1;
	return count;
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
