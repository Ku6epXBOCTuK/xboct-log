<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import DetailPanel from "#lib/components/detail/DetailPanel.svelte";
	import NewTaskModal from "#lib/components/newtask/NewTaskModal.svelte";
	import TaskTable from "#lib/components/table/TaskTable.svelte";
	import Pager from "#lib/components/ui/Pager.svelte";
	import WorkspaceHeader from "#lib/components/workspace/WorkspaceHeader.svelte";
	import { isTypingTarget, matchesHotkey } from "#lib/hotkeys/hotkeys.ts";
	import { listHref, taskHref } from "#lib/navigation/href.ts";
	import { parsePath } from "#lib/navigation/paths.ts";
	import { reloadApp } from "#lib/reload.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { TASK_PAGE_SIZE } from "#lib/tasks/paging.ts";
	import type { Task } from "#lib/types.ts";

	const {
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
	} = useBoard();

	let creating = $state(false);
	let childEpic = $state<Task | null>(null);

	const selected = $derived(selection.task);

	const epics = $derived(stats.epics);

	const visibleTasks = $derived(tasks.tasks);

	const total = $derived(tasks.total);

	const createDefaults = $derived({
		projectId: childEpic?.project_id ?? filters.activeProject ?? undefined,
		epicId: childEpic?.id ?? null,
		scopeId: childEpic?.scope_id ?? null,
	});

	function openTask(id: string) {
		const task = tasks.byId(id);
		if (task === undefined) return;
		const target = taskHref(task.project_id, task.id);
		void goto(target, {
			replace: parsePath(page.url.pathname).taskId !== null,
		});
	}

	function closeTask() {
		const target = listHref("tasks", parsePath(page.url.pathname).project);
		void goto(target, { replace: true });
	}

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

	function onkeydown(event: KeyboardEvent) {
		if (!matchesHotkey(event, "n")) return;
		if (isTypingTarget(event.target)) return;
		event.preventDefault();
		openNew();
	}
</script>

<svelte:window {onkeydown} />

<section class="workspace">
	<WorkspaceHeader
		{tasks}
		{filters}
		{scopes}
		{projects}
		{stats}
		tagStore={tags}
		{theme}
		onnew={openNew}
		onreload={reloadApp}
	/>
	{#if tasks.error !== null}
		<p class="load-error" role="alert">Could not load tasks: {tasks.error}</p>
	{/if}
	<TaskTable
		tasks={visibleTasks}
		allTasks={tasks.tasks}
		{epics}
		{scopes}
		projects={projects.all}
		showProject={filters.activeProject === null}
		selectedId={selection.id}
		sortKey={filters.sortKey}
		sortOrder={filters.sortOrder}
		onsort={(key) => filters.setSort(key)}
		onselect={openTask}
		{total}
		page={filters.page}
		onclear={() => filters.clear()}
		onnew={openNew}
		onepic={(id) => (filters.epic = id)}
	/>
	<Pager
		offset={(filters.page - 1) * TASK_PAGE_SIZE}
		limit={TASK_PAGE_SIZE}
		{total}
		emptyLabel="0 tasks"
		onchange={(offset) =>
			filters.setPage(Math.floor(offset / TASK_PAGE_SIZE) + 1)}
	/>
</section>

<DetailPanel
	{selected}
	{tasks}
	{projects}
	{scopes}
	{tags}
	{data}
	{comments}
	{ui}
	onclear={closeTask}
	ondelete={forgetEpic}
	oncreatechild={openChild}
	onopen={openTask}
	onmoved={openTask}
/>

<NewTaskModal
	bind:open={creating}
	{projects}
	{scopes}
	{tasks}
	{epics}
	{tags}
	{data}
	draftStore={draft}
	{ui}
	initialProject={createDefaults.projectId}
	initialEpic={createDefaults.epicId}
	initialScope={createDefaults.scopeId}
	onopen={(id) => {
		openTask(id);
		creating = false;
	}}
/>

<style>
	.workspace {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1 1 auto;
		height: 100%;
	}

	.load-error {
		margin: 0;
		padding: var(--space-2) var(--edge-pad);
		color: var(--danger, #c0392b);
		font-size: var(--text-xs);
	}
</style>
