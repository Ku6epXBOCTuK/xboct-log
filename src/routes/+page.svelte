<script lang="ts">
	import DetailPanel from "#lib/components/detail/DetailPanel.svelte";
	import NewTaskModal from "#lib/components/newtask/NewTaskModal.svelte";
	import TaskTable from "#lib/components/table/TaskTable.svelte";
	import WorkspaceHeader from "#lib/components/workspace/WorkspaceHeader.svelte";
	import { reloadApp } from "#lib/reload.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { getActiveTotal } from "#lib/tasks/filter.ts";
	import type { Task } from "#lib/types.ts";

	const { tasks, projects, scopes, filters, theme } = useBoard();

	let selectedId = $state<string | null>(null);
	let creating = $state(false);
	let childEpic = $state<Task | null>(null);

	const selected = $derived(
		tasks.tasks.find((task) => task.id === selectedId) ?? null,
	);

	const visibleTasks = $derived(filters.visible(tasks.tasks));

	const total = $derived(getActiveTotal(tasks.tasks, filters));

	const createDefaults = $derived({
		projectId: childEpic?.project_id ?? filters.activeProject ?? undefined,
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

	function forgetEpic(id: string) {
		if (filters.epic === id) filters.epic = "any";
	}
</script>

<section class={`workspace ${selected ? "with-detail compact-table" : ""}`}>
	<WorkspaceHeader
		{tasks}
		{filters}
		{scopes}
		{projects}
		{theme}
		visibleCount={visibleTasks.length}
		onnew={openNew}
		onreload={reloadApp}
	/>
	<TaskTable
		tasks={visibleTasks}
		allTasks={tasks.tasks}
		{scopes}
		{selectedId}
		sortKey={filters.sortKey}
		sortOrder={filters.sortOrder}
		onsort={(key) => filters.setSort(key)}
		onselect={(id) => (selectedId = id)}
		{total}
		onclear={() => filters.clear()}
		onnew={openNew}
		onepic={(id) => (filters.epic = id)}
	/>
</section>

<DetailPanel
	{selected}
	{tasks}
	{projects}
	{scopes}
	onclear={() => (selectedId = null)}
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

<style>
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
