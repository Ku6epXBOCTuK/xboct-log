<script lang="ts">
	import FilterRow from "#lib/components/filters/FilterRow.svelte";
	import MetaRow from "#lib/components/filters/MetaRow.svelte";
	import SearchBar from "#lib/components/filters/SearchBar.svelte";
	import TitleRow from "#lib/components/workspace/TitleRow.svelte";
	import type { Filters } from "#lib/state/filters.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import type { Theme } from "#lib/state/theme.svelte.ts";
	import {
		collectTags,
		countTasksInEpic,
		countTasksInScope,
	} from "#lib/tasks/filter.ts";

	interface Props {
		tasks: TaskStore;
		filters: Filters;
		scopes: ScopeStore;
		theme: Theme;
		visibleCount: number;
		onnew: () => void;
	}

	let { tasks, filters, scopes, theme, visibleCount, onnew }: Props = $props();

	const epics = $derived(tasks.epics);
	const tags = $derived(collectTags(tasks.tasks));
	const scopeOptions = $derived(
		filters.activeProject === "all"
			? scopes.all
			: scopes.listFor(filters.activeProject),
	);
</script>

<header class="workspace-header">
	<TitleRow appearance={theme.appearance} ontoggle={theme.toggle} {onnew} />
	<SearchBar
		value={filters.query}
		oninput={(value) => (filters.query = value)}
	/>
	<FilterRow
		status={filters.status}
		priority={filters.priority}
		onstatus={(value) => (filters.status = value)}
		onpriority={(value) => (filters.priority = value)}
		onclear={() => filters.clear()}
	/>
	<MetaRow
		{filters}
		{epics}
		scopes={scopeOptions}
		{tags}
		{visibleCount}
		total={tasks.tasks.length}
		countEpic={(epicId) => countTasksInEpic(tasks.tasks, epicId)}
		countScope={(scopeId) => countTasksInScope(tasks.tasks, scopeId)}
	/>
</header>

<style>
	.workspace-header {
		flex: none;
		padding: var(--space-6) var(--space-6) var(--space-5);
		border-bottom: 1px solid var(--border);
	}

	@media (max-width: 1100px) {
		.workspace-header {
			padding-inline: var(--space-5);
		}
	}

	@media (max-width: 560px) {
		.workspace-header {
			padding: var(--space-5) var(--space-3) var(--space-4);
		}
	}
</style>
