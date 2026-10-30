import { blockingCandidates } from "#lib/tasks/blocking.ts";
import type { LinkField } from "#lib/tasks/links.ts";
import { CLOSED_STATUSES, type Task } from "#lib/types.ts";

export interface LinkCommands {
	addBlocker(id: string, blockerId: string): Promise<Task>;
	removeBlocker(id: string, blockerId: string): Promise<Task>;
	addLink(
		id: string,
		linkType: "relates_to" | "duplicates",
		targetId: string,
	): Promise<Task>;
	removeLink(
		id: string,
		linkType: "relates_to" | "duplicates",
		targetId: string,
	): Promise<Task>;
}

export interface ConnectionCandidates {
	blockers: Task[];
	links: Task[];
}

export function appendUnique(base: Task[], extra: Task[]): Task[] {
	const ids = new Set(base.map((task) => task.id));
	return [...base, ...extra.filter((task) => !ids.has(task.id))];
}

export function isLinkCandidate(candidate: Task, task: Task): boolean {
	if (candidate.id === task.id) return false;
	if (CLOSED_STATUSES.includes(candidate.status)) return false;
	return (
		!(task.relates_to ?? []).includes(candidate.id) &&
		!(task.duplicates ?? []).includes(candidate.id) &&
		!(task.duplicated_by ?? []).includes(candidate.id)
	);
}

export function connectionCandidates(
	project: Task[],
	found: Task[],
	task: Task,
): ConnectionCandidates {
	return {
		blockers: appendUnique(
			blockingCandidates(project, task),
			blockingCandidates(found, task),
		),
		links: appendUnique(
			project.filter((candidate) => isLinkCandidate(candidate, task)),
			found.filter((candidate) => isLinkCandidate(candidate, task)),
		),
	};
}

export function addConnection(
	commands: LinkCommands,
	task: Task,
	field: LinkField,
	id: string,
): Promise<Task> {
	switch (field) {
		case "blocked_by":
			return commands.addBlocker(task.id, id);
		case "blocks":
			return commands.addBlocker(id, task.id);
		case "duplicated_by":
			return commands.addLink(id, "duplicates", task.id);
		case "duplicates":
			return commands.addLink(task.id, "duplicates", id);
		case "relates_to":
			return commands.addLink(task.id, "relates_to", id);
	}
}

export function removeConnection(
	commands: LinkCommands,
	task: Task,
	field: LinkField,
	id: string,
): Promise<Task> {
	switch (field) {
		case "blocked_by":
			return commands.removeBlocker(task.id, id);
		case "blocks":
			return commands.removeBlocker(id, task.id);
		case "duplicated_by":
			return commands.removeLink(id, "duplicates", task.id);
		case "duplicates":
			return commands.removeLink(task.id, "duplicates", id);
		case "relates_to":
			return commands.removeLink(task.id, "relates_to", id);
	}
}
