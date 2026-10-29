import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { page } from "$app/state";
import { SvelteURL } from "svelte/reactivity";
import { getContext, setContext } from "svelte";
import { fetchFresh } from "#lib/remote/fresh.ts";
import { getScopedProjectIds, getScopes } from "#lib/remote/scopes.remote.ts";
import { createCommentsStore } from "#lib/state/comments.svelte.ts";
import { createDraftStore } from "#lib/state/draft.svelte.ts";
import { createFilters } from "#lib/state/filters.svelte.ts";
import { createFreshness } from "#lib/state/live.ts";
import { createProjectData } from "#lib/state/project-data.svelte.ts";
import { createProjectStore } from "#lib/state/projects.svelte.ts";
import { createScopeStore } from "#lib/state/scopes.svelte.ts";
import { createSelection } from "#lib/state/selection.svelte.ts";
import { createStatsStore } from "#lib/state/stats.svelte.ts";
import { createTagStore, type TagEntry } from "#lib/state/tags.svelte.ts";
import { createTaskStore } from "#lib/state/tasks.svelte.ts";
import { createTheme, type ThemeName } from "#lib/state/theme.svelte.ts";
import { createUiStore } from "#lib/state/ui.svelte.ts";
import { TASK_PAGE_SIZE } from "#lib/tasks/paging.ts";
import { buildTaskQuery } from "#lib/tasks/query.ts";
import type { Project, ProjectFilter, Scope } from "#lib/types.ts";

export interface BoardInput {
	projects: Project[];
	scopes: Scope[];
	tags: TagEntry[];
	project: ProjectFilter;
	theme: ThemeName | null;
}

export function createBoard(input: BoardInput) {
	const fresh = createFreshness();
	const projects = createProjectStore(input.projects);
	const stats = createStatsStore();
	const tasks = createTaskStore([], 0, () =>
		fresh.invalidate(["projects", "counters"]),
	);
	const scopes = createScopeStore(input.scopes);
	const data = createProjectData();
	const tags = createTagStore(input.tags);
	const comments = createCommentsStore();
	const filters = createFilters(input.project);
	const theme = createTheme(input.theme);
	const draft = createDraftStore();
	const ui = createUiStore();
	const selection = createSelection(tasks);

	fresh.register("tasks", () => tasks.refresh());
	fresh.register("tasks", () => data.refresh());
	fresh.register("counters", () => stats.refresh());
	fresh.register("projects", () => projects.refresh());
	fresh.register("tags", () => tags.refresh());
	fresh.register("comments", () => comments.refresh());
	fresh.register("scopes", async () => {
		const ids = await fetchFresh(getScopedProjectIds({}));
		const lists = await Promise.all(
			ids.map((id) => fetchFresh(getScopes({ project_id: id }))),
		);
		scopes.replaceAll(lists.flat());
	});

	$effect.root(() => {
		$effect(() => {
			void stats.load();
		});

		$effect(() => {
			const prefix = projects.all.find(
				(project) => project.id === filters.activeProject,
			)?.prefix;
			void tasks.load(
				buildTaskQuery(filters, filters.page, TASK_PAGE_SIZE, prefix),
			);
		});

		$effect(() => {
			const last = tasks.pages;
			if (tasks.loading || last === 0 || filters.page <= last) return;
			filters.setPage(last);
		});
	});

	function setActiveProject(projectId: ProjectFilter) {
		filters.activeProject = projectId;
		filters.epic = "any";
		filters.scope = "any";

		const url = new SvelteURL(page.url.href);
		if (projectId === null) {
			url.searchParams.delete("project");
		} else {
			url.searchParams.set("project", projectId);
		}

		const pathname = url.pathname.slice(1);
		const target = `${pathname}${url.search}` as
			"" | "kanban" | `?${string}` | `kanban?${string}`;
		void goto(resolve(target), { replace: true, shallow: true });
	}

	return {
		fresh,
		tasks,
		projects,
		scopes,
		stats,
		data,
		tags,
		comments,
		filters,
		theme,
		draft,
		ui,
		selection,
		setActiveProject,
	};
}

export type Board = ReturnType<typeof createBoard>;

const BOARD_KEY = Symbol("xboct-log:board");

export function provideBoard(board: Board) {
	setContext(BOARD_KEY, board);
}

export function useBoard(): Board {
	const board = getContext<Board | undefined>(BOARD_KEY);
	if (!board) {
		throw new Error("board context is not provided");
	}
	return board;
}
