<script lang="ts">
	import FilterRow from "#lib/components/filters/FilterRow.svelte";
	import MetaRow from "#lib/components/filters/MetaRow.svelte";
	import SearchBar from "#lib/components/filters/SearchBar.svelte";
	import TitleRow from "#lib/components/workspace/TitleRow.svelte";
	import type { Filters } from "#lib/state/filters.svelte.ts";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import type { Theme } from "#lib/state/theme.svelte.ts";
	import { epicsForProject } from "#lib/tasks/fields.ts";
	import {
		collectTags,
		countActiveTasksInEpic,
		countActiveTasksInScope,
		countTasksInEpic,
		countTasksInProject,
		countTasksInScope,
	} from "#lib/tasks/filter.ts";

	interface Props {
		tasks: TaskStore;
		filters: Filters;
		projects: ProjectStore;
		scopes: ScopeStore;
		theme: Theme;
		visibleCount: number;
		onnew: () => void;
		onreload: () => void;
	}

	let {
		tasks,
		filters,
		projects,
		scopes,
		theme,
		visibleCount,
		onnew,
		onreload,
	}: Props = $props();

	const epics = $derived(
		epicsForProject(tasks.epics, filters.activeProject, filters.epic),
	);
	const tags = $derived(collectTags(tasks.tasks));
	const scopeOptions = $derived(scopes.listFor(filters.activeProject));

	const total = $derived(
		countTasksInProject(tasks.tasks, filters.activeProject),
	);

	const activeProjectName = $derived(
		projects.all.find((project) => project.id === filters.activeProject)?.name,
	);
</script>

<header class="workspace-header">
	<TitleRow
		appearance={theme.appearance}
		ontoggle={theme.toggle}
		{onnew}
		{onreload}
		projectName={activeProjectName}
	/>
	<SearchBar
		value={filters.query}
		oninput={(value) => (filters.query = value)}
	/>
	<FilterRow
		status={filters.status}
		priority={filters.priority}
		hideClosed={filters.hideClosed}
		onstatus={(value) => (filters.status = value)}
		onpriority={(value) => (filters.priority = value)}
		ontoggleclosed={() => filters.toggleClosed()}
		onclear={() => filters.clear()}
	/>
	<MetaRow
		{filters}
		{epics}
		scopes={scopeOptions}
		{tags}
		{visibleCount}
		{total}
		countEpic={(epicId) => countTasksInEpic(tasks.tasks, epicId)}
		countScope={(scopeId) => countTasksInScope(tasks.tasks, scopeId)}
		countActiveEpic={(epicId) => countActiveTasksInEpic(tasks.tasks, epicId)}
		countActiveScope={(scopeId) =>
			countActiveTasksInScope(tasks.tasks, scopeId)}
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
