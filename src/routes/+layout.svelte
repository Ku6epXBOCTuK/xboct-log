<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import SideBar from "#lib/components/layout/SideBar.svelte";
	import UpdateBanner from "#lib/components/ui/UpdateBanner.svelte";
	import { matchesHotkey } from "#lib/hotkeys/hotkeys.ts";
	import { listHref, taskHref } from "#lib/navigation/href.ts";
	import { parsePath, taskPath } from "#lib/navigation/paths.ts";
	import { createBoard, provideBoard } from "#lib/state/board.svelte.ts";
	import { onMount, untrack } from "svelte";
	import "@fontsource/ibm-plex-sans/400.css";
	import "@fontsource/ibm-plex-sans/500.css";
	import "@fontsource/ibm-plex-sans/600.css";
	import "@fontsource/ibm-plex-mono/400.css";
	import "@ku6epxboctuk/ui-kit/tokens.css";
	import "../app.css";
	import "../kanban.css";
	import type { LayoutProps } from "./$types";

	let { data, children }: LayoutProps = $props();

	const requestedTheme = page.url.searchParams.get("theme");
	const board = untrack(() =>
		createBoard({
			projects: data.projects,
			scopes: data.scopes,
			tags: data.tags,
			project: parsePath(page.url.pathname).project,
			theme:
				requestedTheme === "light" || requestedTheme === "dark"
					? requestedTheme
					: null,
		}),
	);

	provideBoard(board);

	$effect(() => {
		document.documentElement.dataset.uiMode = board.theme.appearance;
	});

	$effect(() => {
		const stop = board.fresh.start();
		return stop;
	});

	$effect(() => {
		const current = board.filters.scope;
		if (
			typeof current === "number" &&
			!board.scopes.all.some((scope) => scope.id === current)
		) {
			board.filters.scope = "any";
		}
	});

	$effect(() => {
		const id = parsePath(page.url.pathname).taskId?.toUpperCase() ?? null;
		board.selection.select(id);
	});

	$effect(() => {
		const id = parsePath(page.url.pathname).taskId?.toUpperCase();
		if (id === undefined) return;
		void board.tasks.pin([id]);
	});

	$effect(() => {
		const location = parsePath(page.url.pathname);
		const id = location.taskId?.toUpperCase();
		if (id === undefined || !board.tasks.isAbsent(id)) return;
		const target = listHref("tasks", location.project);
		void goto(target, { replace: true });
	});

	$effect(() => {
		const location = parsePath(page.url.pathname);
		const id = location.taskId?.toUpperCase();
		if (id === undefined) return;
		const task = board.tasks.byId(id);
		if (task === undefined) return;
		if (taskPath(task.project_id, task.id) === page.url.pathname) return;
		const target = taskHref(task.project_id, task.id);
		void goto(target, { replace: true });
	});

	onMount(() => {
		function handleKeydown(event: KeyboardEvent) {
			if (event.ctrlKey && event.key === "Tab") {
				event.preventDefault();
				window.parent.postMessage(
					{
						type: event.shiftKey ? "xboct-log:prev-tab" : "xboct-log:next-tab",
					},
					"*",
				);
			}
			if (matchesHotkey(event, "ctrl+b")) {
				event.preventDefault();
				board.ui.toggleSidebar();
			}
		}
		window.addEventListener("keydown", handleKeydown);
		return () => window.removeEventListener("keydown", handleKeydown);
	});
</script>

<main
	class={`app-shell ${board.theme.themeClass} ${board.ui.sidebarHidden ? "sidebar-collapsed" : ""}`}
>
	<SideBar
		projects={board.projects}
		scopes={board.scopes}
		tasks={board.tasks}
		stats={board.stats}
		activeProject={board.filters.activeProject}
		selectionProjectId={board.selection.projectId}
		onprojectselect={board.setActiveProject}
		collapsed={board.ui.sidebarHidden}
		onhide={() => board.ui.setSidebarHidden(true)}
		onexpand={() => board.ui.setSidebarHidden(false)}
	/>

	{@render children()}
</main>

<UpdateBanner />

<style>
	.app-shell {
		display: flex;
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		background: var(--background);
	}

	.app-shell.sidebar-collapsed {
		--sidebar-w: 4rem;
	}
</style>
