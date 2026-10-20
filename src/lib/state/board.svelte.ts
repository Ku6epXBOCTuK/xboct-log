import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { page } from "$app/state";
import { SvelteURL } from "svelte/reactivity";
import { getContext, setContext } from "svelte";
import { createCommentsStore } from "#lib/state/comments.svelte.ts";
import { createFilters } from "#lib/state/filters.svelte.ts";
import { createProjectStore } from "#lib/state/projects.svelte.ts";
import { createScopeStore } from "#lib/state/scopes.svelte.ts";
import { createTaskStore } from "#lib/state/tasks.svelte.ts";
import { createTheme, type ThemeName } from "#lib/state/theme.svelte.ts";
import type { Project, ProjectFilter, Scope, Task } from "#lib/types.ts";

export interface BoardInput {
	tasks: Task[];
	projects: Project[];
	scopes: Scope[];
	project: ProjectFilter;
	theme: ThemeName | null;
}

export function createBoard(input: BoardInput) {
	const tasks = createTaskStore(input.tasks);
	const projects = createProjectStore(input.projects);
	const scopes = createScopeStore(input.scopes);
	const comments = createCommentsStore();
	const filters = createFilters(input.project);
	const theme = createTheme(input.theme);

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
		tasks,
		projects,
		scopes,
		comments,
		filters,
		theme,
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
