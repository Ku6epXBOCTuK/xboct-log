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

export function appPath(pathname: string): string | null {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length === 0) return "/";

	const [head, second, third, fourth] = segments;
	const category = CATEGORIES.find((item) => item === head);

	if (segments.length === 1) {
		if (category !== undefined || head === "backups") return pathname;
		return null;
	}

	if (category === undefined) return null;

	if (second === "project" && third !== undefined) {
		if (segments.length === 3) return pathname;
		if (segments.length === 4 && category === "tasks") {
			return isTaskId(fourth) ? pathname : null;
		}
		return null;
	}

	if (category === "tasks" && segments.length === 2 && isTaskId(second)) {
		return pathname;
	}

	return null;
}

export function listPath(category: Category, project: string | null): string {
	if (project === null) return `/${category}`;
	return `/${category}/project/${project}`;
}

export function taskPath(project: string, taskId: string): string {
	return `/tasks/project/${project}/${taskId}`;
}
