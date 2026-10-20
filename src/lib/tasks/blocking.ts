import { CLOSED_STATUSES, type Task } from "#lib/types.ts";

export function blockedByIds(task: Task): string[] {
	return task.blocked_by ?? [];
}

export function blockingIds(task: Task): string[] {
	return task.blocks ?? [];
}

export function isOpenBlocker(tasks: Task[], blockerId: string): boolean {
	const blocker = tasks.find((task) => task.id === blockerId);
	if (!blocker) return true;
	return !CLOSED_STATUSES.includes(blocker.status);
}

export function openBlockers(tasks: Task[], task: Task): string[] {
	return blockedByIds(task).filter((id) => isOpenBlocker(tasks, id));
}

export function blockedDownstream(tasks: Task[], taskId: string): Set<string> {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const seen = new Set<string>();
	const stack = [...(byId.get(taskId)?.blocks ?? [])];
	while (stack.length > 0) {
		const current = stack.pop() as string;
		if (seen.has(current)) continue;
		seen.add(current);
		for (const next of byId.get(current)?.blocks ?? []) {
			stack.push(next);
		}
	}
	return seen;
}

export function blockingCandidates(tasks: Task[], task: Task): Task[] {
	const linked = new Set(blockedByIds(task));
	const downstream = blockedDownstream(tasks, task.id);
	return tasks.filter(
		(candidate) =>
			candidate.id !== task.id &&
			!linked.has(candidate.id) &&
			!downstream.has(candidate.id) &&
			!CLOSED_STATUSES.includes(candidate.status),
	);
}
