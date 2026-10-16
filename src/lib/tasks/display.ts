import type { Status } from "#lib/types.ts";

export const STATUS_LABELS: Record<Status, string> = {
	open: "open",
	"in-progress": "in progress",
	blocked: "blocked",
	done: "done",
	cancelled: "cancelled",
};

export function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";

	const day = String(date.getUTCDate()).padStart(2, "0");
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const year = String(date.getUTCFullYear()).slice(-2);

	// TODO: why not to use Intl.formatDate?
	return `${day}/${month}/${year}`;
}
