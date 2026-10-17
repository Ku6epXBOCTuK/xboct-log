<script lang="ts">
	import DetailPanel from "#lib/components/detail/DetailPanel.svelte";
	import SideBar from "#lib/components/layout/SideBar.svelte";
	import NewTaskModal from "#lib/components/newtask/NewTaskModal.svelte";
	import TaskTable from "#lib/components/table/TaskTable.svelte";
	import WorkspaceHeader from "#lib/components/workspace/WorkspaceHeader.svelte";
	import { getProjects } from "#lib/remote/projects.remote.ts";
	import { getScopedProjectIds, getScopes } from "#lib/remote/scopes.remote.ts";
	import { getTasks } from "#lib/remote/tasks.remote.ts";
	import { createFilters } from "#lib/state/filters.svelte.ts";
	import { createProjectStore } from "#lib/state/projects.svelte.ts";
	import { createScopeStore } from "#lib/state/scopes.svelte.ts";
	import { createTaskStore } from "#lib/state/tasks.svelte.ts";
	import { createTheme } from "#lib/state/theme.svelte.ts";
	import type { Task } from "#lib/types.ts";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	const loadedProjects = await getProjects({ includeArchived: true });
	const loadedTasks = await getTasks({ limit: 1000 });
	const scopedProjectIds = await getScopedProjectIds();
	const loadedScopes = (
		await Promise.all(scopedProjectIds.map((id) => getScopes(id)))
	).flat();

	const tasks = createTaskStore(loadedTasks);
	const projects = createProjectStore(loadedProjects);
	const scopes = createScopeStore(loadedScopes);
	const filters = createFilters(page.url.searchParams.get("project") ?? "all");
	const requestedTheme = page.url.searchParams.get("theme");
	const theme = createTheme(
		requestedTheme === "light" || requestedTheme === "dark"
			? requestedTheme
			: null,
	);

	let selected: Task | null = $state(null);
	let creating = $state(false);
	let childEpic = $state<Task | null>(null);

	const visibleTasks = $derived(filters.visible(tasks.tasks));

	const createDefaults = $derived({
		projectId:
			childEpic?.project_id ??
			(filters.activeProject === "all" ? undefined : filters.activeProject),
		epicId: childEpic?.id ?? null,
		scopeId: childEpic?.scope_id ?? null,
	});

	function openNew() {
		childEpic = null;
		creating = true;
	}

	function openChild(task: Task) {
		childEpic = task;
		creating = true;
	}

	$effect(() => {
		const current = filters.scope;
		if (
			typeof current === "number" &&
			!scopes.all.some((scope) => scope.id === current)
		) {
			filters.scope = "any";
		}
	});

	$effect(() => {
		const current = selected;
		if (current === null) return;
		const live = tasks.tasks.find((task) => task.id === current.id);
		if (live !== undefined && live !== current) selected = live;
	});

	function setActiveProject(projectId: string) {
		filters.activeProject = projectId;
		filters.epic = "any";
		filters.scope = "any";

		const url = new URL(page.url.href);
		if (projectId === "all") {
			url.searchParams.delete("project");
		} else {
			url.searchParams.set("project", projectId);
		}

		const pathname = url.pathname.slice(1);
		const target = `${pathname}${url.search}` as
			"" | "kanban" | `?${string}` | `kanban?${string}`;
		void goto(resolve(target), { replace: true, shallow: true });
	}

	function forgetEpic(id: string) {
		if (filters.epic === id) filters.epic = "any";
	}
</script>

<main class={`app-shell ${theme.themeClass}`}>
	<SideBar
		{projects}
		{scopes}
		{tasks}
		activeProject={filters.activeProject}
		onprojectselect={setActiveProject}
	/>

	<section class={`workspace ${selected ? "with-detail compact-table" : ""}`}>
		<WorkspaceHeader
			{tasks}
			{filters}
			{scopes}
			{theme}
			visibleCount={visibleTasks.length}
			onnew={openNew}
		/>
		<TaskTable
			tasks={visibleTasks}
			{scopes}
			bind:selected
			total={tasks.tasks.length}
			onclear={() => filters.clear()}
			onnew={openNew}
			onepic={(id) => (filters.epic = id)}
		/>
	</section>

	<DetailPanel
		bind:selected
		{tasks}
		{projects}
		{scopes}
		ondelete={forgetEpic}
		oncreatechild={openChild}
	/>

	<NewTaskModal
		bind:open={creating}
		{projects}
		{scopes}
		{tasks}
		initialProject={createDefaults.projectId}
		initialEpic={createDefaults.epicId}
		initialScope={createDefaults.scopeId}
	/>
</main>

<style>
	.app-shell {
		display: flex;
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		background: var(--background);
	}

	.workspace {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1 1 auto;
		height: 100%;
	}

	.workspace.with-detail {
		max-width: calc(100vw - var(--sidebar-w) - var(--detail-w));
	}

	@media (max-width: 560px) {
		.workspace.with-detail {
			max-width: calc(100vw - var(--sidebar-w));
		}
	}
</style>
