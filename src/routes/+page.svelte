<script lang="ts">
	import DetailPanel from "#lib/components/detail/DetailPanel.svelte";
	import NewTaskModal from "#lib/components/newtask/NewTaskModal.svelte";
	import TaskTable from "#lib/components/table/TaskTable.svelte";
	import WorkspaceHeader from "#lib/components/workspace/WorkspaceHeader.svelte";
	import { reloadApp } from "#lib/reload.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { isTypingTarget, matchesHotkey } from "#lib/hotkeys/hotkeys.ts";
	import type { Task } from "#lib/types.ts";

	const {
		tasks,
		projects,
		scopes,
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

	const visibleTasks = $derived(tasks.tasks);

	const total = $derived(tasks.total);

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
		{scopes}
		projects={projects.all}
		showProject={filters.activeProject === null}
		selectedId={selection.id}
		sortKey={filters.sortKey}
		sortOrder={filters.sortOrder}
		onsort={(key) => filters.setSort(key)}
		onselect={(id) => selection.select(id)}
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
	{tags}
	{comments}
	{ui}
	onclear={() => selection.clear()}
	ondelete={forgetEpic}
	oncreatechild={openChild}
	onopen={(id) => selection.select(id)}
/>

<NewTaskModal
	bind:open={creating}
	{projects}
	{scopes}
	{tasks}
	{tags}
	draftStore={draft}
	{ui}
	initialProject={createDefaults.projectId}
	initialEpic={createDefaults.epicId}
	initialScope={createDefaults.scopeId}
	onopen={(id) => {
		selection.select(id);
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
