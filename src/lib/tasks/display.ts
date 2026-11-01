import type { ClosedReason, Status } from "#lib/types.ts";

export const STATUS_LABELS: Record<Status, string> = {
	backlog: "backlog",
	open: "open",
	"in-progress": "in progress",
	blocked: "blocked",
	done: "done",
	cancelled: "cancelled",
};

export const CLOSED_REASON_LABELS: Record<ClosedReason, string> = {
	fixed: "Fixed",
	wontfix: "Won't fix",
	obsolete: "Obsolete",
	duplicate: "Duplicate",
	"not-reproduced": "Not reproduced",
};

export function messageOf(error: unknown): string {
	if (error !== null && typeof error === "object" && "body" in error) {
		const { message } = error.body as { message?: string };
		if (typeof message === "string" && message !== "") return message;
	}

	if (error instanceof Error && error.message !== "") return error.message;

	return "Update failed";
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const pad = (value: number) => String(value).padStart(2, "0");

// NOTE: timestamps are stored in UTC, so they are rendered in the local zone;
// a date without a time is already a calendar day and is never shifted.
export function formatDate(value: string): string {
	if (DATE_ONLY.test(value)) {
		const [year, month, day] = value.split("-");
		return `${day}/${month}/${year.slice(-2)}`;
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";

	return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)}`;
}

export function formatDateTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";

	return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeDueDate(
	value: string | null | undefined,
): string | null {
	const trimmed = (value ?? "").trim();
	if (trimmed === "") return null;
	if (DATE_ONLY.test(trimmed)) {
		return Number.isNaN(Date.parse(`${trimmed}T00:00:00Z`)) ? null : trimmed;
	}
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString().slice(0, 10);
}

export function isOverdue(dueAt: string | null, today: string): boolean {
	return dueAt !== null && dueAt < today;
}
