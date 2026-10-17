export const STATUSES = [
	"open",
	"in-progress",
	"blocked",
	"done",
	"cancelled",
] as const;

export type Status = (typeof STATUSES)[number];

export const CLOSED_STATUSES: readonly Status[] = ["done", "cancelled"];

export const CLOSED_REASONS = ["fixed", "obsolete", "duplicate"] as const;

export type ClosedReason = (typeof CLOSED_REASONS)[number];

export const STATUS_BY_REASON: Record<ClosedReason, Status> = {
	fixed: "done",
	obsolete: "cancelled",
	duplicate: "cancelled",
};

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_RANK: Record<Priority, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};

export const INBOX_PROJECT_ID = "inbox";
export const INBOX_PROJECT_PREFIX = "INB";

export interface Project {
	id: string;
	name: string;
	prefix: string;
	created_at: string;
	archived_at: string | null;
}

export interface Scope {
	id: number;
	project_id: string;
	name: string;
	created_at: string;
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
	source_line: number | null;
	tags: string[];
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	closed_reason: ClosedReason | null;
	deleted_at: string | null;
}
