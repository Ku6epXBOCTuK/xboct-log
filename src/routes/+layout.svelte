<script lang="ts">
	import { page } from "$app/state";
	import SideBar from "#lib/components/layout/SideBar.svelte";
	import UpdateBanner from "#lib/components/ui/UpdateBanner.svelte";
	import { matchesHotkey } from "#lib/hotkeys/hotkeys.ts";
	import { createBoard, provideBoard } from "#lib/state/board.svelte.ts";
	import { startLiveSync } from "#lib/state/live.ts";
	import { onMount, untrack } from "svelte";
	import "../app.css";
	import "../kanban.css";
	import type { LayoutProps } from "./$types";

	let { data, children }: LayoutProps = $props();

	const requestedTheme = page.url.searchParams.get("theme");
	const board = untrack(() =>
		createBoard({
			tasks: data.tasks,
			tasksTotal: data.tasksTotal,
			projects: data.projects,
			scopes: data.scopes,
			tags: data.tags,
			project: page.url.searchParams.get("project"),
			theme:
				requestedTheme === "light" || requestedTheme === "dark"
					? requestedTheme
					: null,
		}),
	);

	provideBoard(board);

	$effect(() => {
		const stop = startLiveSync(board);
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
