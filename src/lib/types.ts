export const STATUSES = [
	"open",
	"in-progress",
	"blocked",
	"done",
	"cancelled",
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_RANK: Record<Status, number> = {
	open: 0,
	"in-progress": 1,
	blocked: 2,
	done: 3,
	cancelled: 4,
};

export const CLOSED_STATUSES: readonly Status[] = ["done", "cancelled"];

export const CLOSED_REASONS = [
	"fixed",
	"wontfix",
	"obsolete",
	"duplicate",
	"not-reproduced",
] as const;

export type ClosedReason = (typeof CLOSED_REASONS)[number];

export const STATUS_BY_REASON: Record<ClosedReason, Status> = {
	fixed: "done",
	wontfix: "cancelled",
	obsolete: "cancelled",
	duplicate: "cancelled",
	"not-reproduced": "cancelled",
};

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_RANK: Record<Priority, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};

export const ESTIMATES = ["S", "M", "L"] as const;

export type Estimate = (typeof ESTIMATES)[number];

export const INBOX_PROJECT_ID = "inbox";
export const INBOX_PROJECT_PREFIX = "INB";

export interface Project {
	id: string;
	name: string;
	prefix: string;
	created_at: string;
	archived_at: string | null;
}

export type ProjectFilter = string | null;

export interface Scope {
	id: number;
	project_id: string;
	name: string;
	created_at: string;
	task_count?: number;
	epics_count?: number;
}

export const ACTIVITY_ENTITIES = ["task", "project", "scope"] as const;

export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

export type ActivitySource = "ui" | "mcp" | "cli";

export type ActivityValue = string | number | boolean | string[] | null;

export interface ActivityChange {
	field: string;
	from: ActivityValue;
	to: ActivityValue;
}

export interface ActivityItem {
	ts: string;
	source: string;
	op: string;
	fields: string[];
	changes: ActivityChange[];
	old_id: string | null;
}

export interface ActivityLogItem extends ActivityItem {
	entity: string;
	entity_id: string;
}

export interface TaskRevision {
	id: number;
	task_id: string;
	field: string;
	ref_id: string | null;
	body: string;
	created_at: string;
}

export interface Comment {
	id: string;
	task_id: string;
	body: string;
	created_at: string;
	edited_at: string | null;
	deleted_at: string | null;
}

export interface TaskWithChanges extends Task {
	changes: ActivityChange[];
}

export interface TaskWithWarnings extends Task {
	warnings: string[];
}

export interface ChangedTaskWithWarnings extends TaskWithChanges {
	warnings: string[];
}

export interface Task {
	id: string;
	project_id: string;
	number: number;
	title: string;
	description: string;
	status: Status;
	priority: Priority;
	is_epic: boolean;
	epic_id: string | null;
	scope_id: number | null;
	source_file: string | null;
	tags: string[];
	estimate: Estimate | null;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	closed_reason: ClosedReason | null;
	deleted_at: string | null;
	project_name?: string;
	scope_name?: string;
	short_description?: string;
	blocked_by?: string[];
	blocks?: string[];
}
