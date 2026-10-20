import type { ClosedReason, Status } from "#lib/types.ts";

export const STATUS_LABELS: Record<Status, string> = {
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

export function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";

	const day = String(date.getUTCDate()).padStart(2, "0");
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const year = String(date.getUTCFullYear()).slice(-2);

	// TODO: why not to use Intl.formatDate?
	return `${day}/${month}/${year}`;
}
