<script lang="ts">
	import FilterRow from "#lib/components/filters/FilterRow.svelte";
	import MetaRow from "#lib/components/filters/MetaRow.svelte";
	import SearchBar from "#lib/components/filters/SearchBar.svelte";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { epicsForProject } from "#lib/tasks/fields.ts";

	const { tasks, filters, scopes, stats, tags: tagStore } = useBoard();

	const epics = $derived(
		epicsForProject(stats.epics, filters.activeProject, filters.epic),
	);
	const tags = $derived(tagStore.all);
	const scopeOptions = $derived(scopes.listFor(filters.activeProject));
</script>

<header class="workspace-header">
	<SearchBar
		value={filters.query}
		oninput={(value) => (filters.query = value)}
		onclear={() => filters.resetQuery()}
	/>
	<FilterRow {filters} />
	<MetaRow
		{filters}
		{epics}
		scopes={scopeOptions}
		{tags}
		visibleCount={tasks.tasks.length}
		total={tasks.total}
	/>
</header>

<style>
	.workspace-header {
		flex: none;
		padding: var(--edge-pad) var(--edge-pad) var(--space-5);
		border-bottom: 1px solid var(--border);
	}

	@media (max-width: 560px) {
		.workspace-header {
			padding: var(--edge-pad) var(--edge-pad) var(--space-4);
		}
	}
</style>
