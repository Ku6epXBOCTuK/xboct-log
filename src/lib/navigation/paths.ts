import { isTaskId } from "#lib/tasks/route.ts";

export const CATEGORIES = ["tasks", "kanban", "activity", "deleted"] as const;

export type Category = (typeof CATEGORIES)[number];

export interface AppLocation {
	category: Category | null;
	project: string | null;
	taskId: string | null;
}

export function parsePath(pathname: string): AppLocation {
	const segments = pathname.split("/").filter(Boolean);
	const category = CATEGORIES.find((item) => item === segments[0]);

	if (category === undefined) {
		return { category: null, project: null, taskId: null };
	}

	if (segments.length === 2) {
		const taskId =
			category === "tasks" && isTaskId(segments[1]) ? segments[1] : null;
		return { category, project: null, taskId };
	}

	if (segments[1] === "project" && segments[2] !== undefined) {
		const taskId =
			category === "tasks" && segments.length === 4 && isTaskId(segments[3])
				? segments[3]
				: null;
		return { category, project: segments[2], taskId };
	}

	return { category, project: null, taskId: null };
}

export function listPath(category: Category, project: string | null): string {
	if (project === null) return `/${category}`;
	return `/${category}/project/${project}`;
}

export function taskPath(project: string, taskId: string): string {
	return `/tasks/project/${project}/${taskId}`;
}
