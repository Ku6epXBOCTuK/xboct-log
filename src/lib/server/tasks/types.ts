import type {
	ActivityChange,
	Estimate,
	Priority,
	Status,
	Task,
} from "../../types";
import type { ErrorKind } from "../errors";

export interface TaskRow {
	id: string;
	project_id: string;
	number: number;
	title: string;
	description: string;
	status: string;
	priority: string;
	is_epic: number;
	epic_id: string | null;
	scope_id: number | null;
	source_file: string | null;
	tags: string;
	estimate: string | null;
	assignee: string | null;
	due_at: string | null;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	closed_reason: string | null;
	deleted_at: string | null;
	project_name?: string;
	scope_name?: string;
	attachments_count?: number;
}

export interface NewTask {
	project_id: string;
	title: string;
	description?: string;
	status?: Status;
	priority?: Priority;
	is_epic?: boolean;
	epic_id?: string | null;
	scope_id?: number | null;
	source_file?: string | null;
	tags?: string[];
	estimate?: Estimate | null;
	assignee?: string | null;
	due_at?: string | null;
}

export interface TaskPatch {
	title?: string;
	description?: string;
	status?: Status;
	priority?: Priority;
	is_epic?: boolean;
	epic_id?: string | null;
	scope_id?: number | null;
	source_file?: string | null;
	tags?: string[];
	estimate?: Estimate | null;
	assignee?: string | null;
	due_at?: string | null;
}

export type TaskChange = ActivityChange;

export interface TaskUpdateOutcome {
	task: Task;
	changes: TaskChange[];
	released?: ReleasedLink[];
}

export interface TaskQuery {
	project_id?: string | string[];
	exclude_project_id?: string | string[];
	status?: Status[];
	priority?: Priority[];
	estimate?: Estimate[];
	assignee?: string[];
	due_before?: string;
	due_after?: string;
	tag?: string[];
	is_epic?: boolean;
	epic_id?: string | string[] | null;
	scope_id?: number | number[] | null;
	has_epic?: boolean;
	has_scope?: boolean;
	blocked_by?: string;
	blocks?: string;
	q?: string;
	title?: string;
	title_exact?: string;
	source_file?: string;
	fields?: string;
	include_project?: boolean;
	include_scope?: boolean;
	project_archived?: boolean;
	sort?:
		"updated_at" | "created_at" | "closed_at" | "priority" | "number" | "title";
	order?: "asc" | "desc";
	limit?: number;
	offset?: number;
	include_deleted?: boolean;
	deleted_only?: boolean;
	include_description?: boolean;
}

export interface TasksByIds {
	items: Task[];
	missing: string[];
}

export interface ReleasedLink {
	task_id: string;
	changes: ActivityChange[];
}

export interface DeleteTaskOutcome {
	id: string;
	deleted_at: string;
	changes: ActivityChange[];
	released: ReleasedLink[];
}

export interface BatchError {
	kind: ErrorKind;
	message: string;
}

export type BatchItem =
	| {
			index: number;
			id: string;
			ok: true;
			task: Task;
			changes: TaskChange[];
			released: ReleasedLink[];
	  }
	| { index: number; id: string; ok: false; error: BatchError };

export type CreateBatchItem =
	| {
			index: number;
			id: string;
			ok: true;
			task: Task;
			changes: TaskChange[];
			released: ReleasedLink[];
	  }
	| { index: number; id: null; ok: false; error: BatchError };
