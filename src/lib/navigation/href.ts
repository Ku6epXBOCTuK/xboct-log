import { resolve } from "$app/paths";
import { page } from "$app/state";
import type { ResolvedPathname } from "$app/types";
import { listPath, type Category } from "#lib/navigation/paths.ts";
import type { Task } from "#lib/types.ts";

export function listHref(
	category: Category,
	project: string | null,
): ResolvedPathname {
	return resolve(
		`${listPath(category, project)}${page.url.search}` as "/tasks",
	);
}

export function appHref(url: URL): ResolvedPathname {
	// NOTE: the app runs without a base path, so the absolute pathname from a
	// markdown link is already resolved; the current search keeps the theme.
	const search = url.search || page.url.search;
	return `${url.pathname}${search}${url.hash}` as ResolvedPathname;
}

export function taskHref(project: string, taskId: string): ResolvedPathname {
	return resolve(
		`/tasks/project/[project]/[id]${page.url.search}` as "/tasks/project/[project]/[id]",
		{ project, id: taskId },
	);
}

export function taskHrefFor(
	find: (id: string) => Task | undefined,
	id: string,
): string | null {
	const task = find(id);
	return task === undefined ? null : taskHref(task.project_id, task.id);
}
