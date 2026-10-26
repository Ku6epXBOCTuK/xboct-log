import { CLOSED_STATUSES, type ProjectFilter, type Task } from "#lib/types.ts";

export function projectTasks(tasks: Task[], projectId: ProjectFilter): Task[] {
	return projectId === null
		? tasks
		: tasks.filter((task) => task.project_id === projectId);
}

export interface TagCount {
	tag: string;
	count: number;
	active: number;
}

export function collectTags(
	tasks: Task[],
	projectId: ProjectFilter = null,
	keep: string[] = [],
): TagCount[] {
	const counts = new Map<string, { count: number; active: number }>();

	for (const task of projectTasks(tasks, projectId)) {
		const active = CLOSED_STATUSES.includes(task.status) ? 0 : 1;

		for (const tag of task.tags) {
			const entry = counts.get(tag) ?? { count: 0, active: 0 };
			entry.count += 1;
			entry.active += active;
			counts.set(tag, entry);
		}
	}

	const entries = [...counts.entries()].map(([tag, entry]) => ({
		tag,
		...entry,
	}));

	for (const tag of keep) {
		if (!counts.has(tag)) {
			entries.push({ tag, count: 0, active: 0 });
		}
	}

	return entries.sort((left, right) => {
		const leftIdle = left.active === 0 ? 1 : 0;
		const rightIdle = right.active === 0 ? 1 : 0;
		if (leftIdle !== rightIdle) return leftIdle - rightIdle;
		return left.tag.localeCompare(right.tag);
	});
}

export interface EpicProgress {
	closed: number;
	total: number;
}

export function collectEpicProgress(tasks: Task[]): Map<string, EpicProgress> {
	const progress = new Map<string, EpicProgress>();

	for (const task of tasks) {
		if (task.epic_id === null) continue;

		const entry = progress.get(task.epic_id);

		if (entry === undefined) {
			progress.set(task.epic_id, {
				closed: CLOSED_STATUSES.includes(task.status) ? 1 : 0,
				total: 1,
			});
			continue;
		}

		entry.total += 1;
		if (CLOSED_STATUSES.includes(task.status)) entry.closed += 1;
	}

	return progress;
}
