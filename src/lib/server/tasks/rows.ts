import type { DatabaseSync } from "node:sqlite";
import {
	CLOSED_REASONS,
	ESTIMATES,
	PRIORITIES,
	STATUSES,
	type ClosedReason,
	type Estimate,
	type Priority,
	type Status,
	type Task,
} from "../../types";
import type { TaskRow } from "./types";

export function mapTask(row: TaskRow): Task {
	return {
		id: row.id,
		project_id: row.project_id,
		number: row.number,
		title: row.title,
		description: row.description,
		status: row.status as Status,
		priority: row.priority as Priority,
		is_epic: row.is_epic === 1,
		epic_id: row.epic_id,
		scope_id: row.scope_id,
		source_file: row.source_file,
		tags: JSON.parse(row.tags) as string[],
		estimate: (row.estimate as Estimate | null) ?? null,
		assignee: row.assignee,
		due_at: row.due_at,
		created_at: row.created_at,
		updated_at: row.updated_at,
		closed_at: row.closed_at,
		closed_reason: row.closed_reason as ClosedReason | null,
		deleted_at: row.deleted_at,
		project_name: row.project_name ?? undefined,
		scope_name: row.scope_name ?? undefined,
	};
}

export const TASK_BASE_FIELDS: string[] = Object.keys(
	mapTask({ tags: "[]" } as TaskRow),
);

export function parseFields(fields: string | undefined): string[] | null {
	if (!fields) {
		return null;
	}
	const requested = fields
		.split(",")
		.map((field) => field.trim())
		.filter(Boolean);
	return requested.length > 0 ? [...new Set(requested)] : null;
}

export function pickFields(task: Task, fields: string[]): Task {
	const source = task as unknown as Record<string, unknown>;
	const picked: Record<string, unknown> = {};
	for (const field of fields) {
		if (source[field] !== undefined) {
			picked[field] = source[field];
		}
	}
	const pickedTask = picked as unknown as Task;
	return Object.keys(picked).length > 0 ? pickedTask : task;
}

const SHORT_DESCRIPTION_LENGTH = 120;

function shortDescription(description: string): string {
	const firstLine = description.split("\n")[0].trim();
	return firstLine.length > SHORT_DESCRIPTION_LENGTH
		? `${firstLine.slice(0, SHORT_DESCRIPTION_LENGTH)}…`
		: firstLine;
}

export function taskWithShortDescription(
	task: Task,
	includeDescription: boolean,
): Task {
	if (includeDescription) {
		return task;
	}
	const result: Record<string, unknown> = {
		...task,
		short_description: shortDescription(task.description),
	};
	delete result.description;
	return result as unknown as Task;
}

export function isStatus(value: string): value is Status {
	return (STATUSES as readonly string[]).includes(value);
}

export function isClosedReason(value: string): value is ClosedReason {
	return (CLOSED_REASONS as readonly string[]).includes(value);
}

export function isPriority(value: string): value is Priority {
	return (PRIORITIES as readonly string[]).includes(value);
}

export function isEstimate(value: string): value is Estimate {
	return (ESTIMATES as readonly string[]).includes(value);
}

export function emptyToNull(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

export function normalizeTags(tags: string[] | undefined): string[] {
	if (!tags) {
		return [];
	}
	const seen = new Set<string>();
	for (const raw of tags) {
		const tag = raw.trim();
		if (tag) {
			seen.add(tag);
		}
	}
	return [...seen];
}

export function taskById(db: DatabaseSync, id: string): Task | undefined {
	const row = db
		.prepare("SELECT * FROM tasks WHERE id = ?")
		.get(id) as unknown as TaskRow | undefined;
	return row ? mapTask(row) : undefined;
}
