import { resolve } from "$app/paths";
import { page } from "$app/state";
import type { ResolvedPathname } from "$app/types";
import { listPath, type Category } from "#lib/navigation/paths.ts";
import { withoutListSearch } from "#lib/navigation/search.ts";
import type { Task } from "#lib/types.ts";

export function listHref(
	category: Category,
	project: string | null,
): ResolvedPathname {
	return resolve(
		`${listPath(category, project)}${page.url.search}` as "/tasks",
	);
}

export type TagLink = "active" | "backlog" | "all";

export function tagHref(name: string, link: TagLink): ResolvedPathname {
	const params = new URLSearchParams(withoutListSearch(page.url.search));
	params.set("tags", name);
	if (link === "active") params.set("backlog", "0");
	if (link === "backlog") params.set("status", "backlog");
	if (link === "all") params.set("closed", "1");
	return resolve(`/tasks?${params.toString()}` as "/tasks");
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
