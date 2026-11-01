import { messageOf } from "#lib/tasks/display.ts";

export type LinkField =
	"relates_to" | "duplicates" | "duplicated_by" | "blocked_by" | "blocks";

export interface TaskLinkDraft {
	blocked_by: string[];
	blocks: string[];
	relates_to: string[];
	duplicates: string[];
	duplicated_by: string[];
}

export function emptyLinkDraft(): TaskLinkDraft {
	return {
		blocked_by: [],
		blocks: [],
		relates_to: [],
		duplicates: [],
		duplicated_by: [],
	};
}

export function hasLinks(draft: TaskLinkDraft): boolean {
	return Object.values(draft).some((ids) => ids.length > 0);
}

export interface LinkJob {
	field: LinkField;
	target: string;
	run: () => Promise<unknown>;
}

export interface LinkFailure {
	field: LinkField;
	target: string;
	message: string;
}

export async function applyLinkJobs(
	jobs: LinkJob[],
	applied?: (job: LinkJob) => void,
): Promise<LinkFailure[]> {
	const failures: LinkFailure[] = [];
	for (const job of jobs) {
		try {
			await job.run();
			applied?.(job);
		} catch (error) {
			failures.push({
				field: job.field,
				target: job.target,
				message: messageOf(error),
			});
		}
	}
	return failures;
}
