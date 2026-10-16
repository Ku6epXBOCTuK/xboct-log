<script lang="ts">
	import DetailPanel from "#lib/components/detail/DetailPanel.svelte";
	import SideBar from "#lib/components/layout/SideBar.svelte";
	import NewTaskModal from "#lib/components/newtask/NewTaskModal.svelte";
	import TaskTable from "#lib/components/table/TaskTable.svelte";
	import WorkspaceHeader from "#lib/components/workspace/WorkspaceHeader.svelte";
	import { getProjects } from "#lib/remote/projects.remote.ts";
	import { getTasks } from "#lib/remote/tasks.remote.ts";
	import { createFilters } from "#lib/state/filters.svelte.ts";
	import { createProjectStore } from "#lib/state/projects.svelte.ts";
	import { createTaskStore } from "#lib/state/tasks.svelte.ts";
	import { createTheme } from "#lib/state/theme.svelte.ts";
	import type { Task } from "#lib/types.ts";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	const loadedProjects = await getProjects({ includeArchived: true });
	const loadedTasks = await getTasks({ limit: 1000 });

	const tasks = createTaskStore(loadedTasks);
	const projects = createProjectStore(loadedProjects);
	const filters = createFilters(page.url.searchParams.get("project") ?? "all");
	const theme = createTheme();

	let selected: Task | null = $state(null);
	let creating = $state(false);

	const visibleTasks = $derived(filters.visible(tasks.tasks));

	function setActiveProject(projectId: string) {
		filters.activeProject = projectId;
		filters.epic = "any";

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
		tasks={tasks.tasks}
		activeProject={filters.activeProject}
		onprojectselect={setActiveProject}
	/>

	<section class={`workspace ${selected ? "with-detail compact-table" : ""}`}>
		<WorkspaceHeader
			{tasks}
			{filters}
			{theme}
			visibleCount={visibleTasks.length}
			onnew={() => (creating = true)}
		/>
		<TaskTable
			tasks={visibleTasks}
			bind:selected
			total={tasks.tasks.length}
			onclear={() => filters.clear()}
			onnew={() => (creating = true)}
			onepic={(id) => (filters.epic = id)}
		/>
	</section>

	<DetailPanel bind:selected {tasks} {projects} ondelete={forgetEpic} />

	<NewTaskModal
		bind:open={creating}
		{projects}
		{tasks}
		oncreated={(task) => (selected = task)}
	/>
</main>
