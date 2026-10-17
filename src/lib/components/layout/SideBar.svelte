<script lang="ts">
	import { countInProgress } from "#lib/tasks/filter.ts";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import ProjectSection from "#lib/components/projects/ProjectSection.svelte";
	import BrandMark from "./BrandMark.svelte";
	import LanguageSwitch from "./LanguageSwitch.svelte";
	import PrimaryNav from "./PrimaryNav.svelte";

	interface Props {
		projects: ProjectStore;
		scopes: ScopeStore;
		tasks: TaskStore;
		activeProject: string;
		onprojectselect?: (projectId: string) => void;
	}

	let { projects, scopes, tasks, activeProject, onprojectselect }: Props =
		$props();
</script>

<aside class="sidebar">
	<BrandMark />
	<PrimaryNav
		taskCount={tasks.tasks.length}
		inProgressCount={countInProgress(tasks.tasks)}
	/>
	<ProjectSection
		{projects}
		{scopes}
		{tasks}
		{activeProject}
		onselect={onprojectselect ?? (() => {})}
	/>
	<LanguageSwitch />
</aside>

<style>
	.sidebar {
		width: var(--sidebar-w);
		min-width: var(--sidebar-w);
		display: flex;
		flex-direction: column;
		padding: var(--edge-pad) var(--space-3) var(--edge-pad);
		border-right: 1px solid var(--border);
		background: var(--surface);
		overflow-y: auto;
	}

	@media (max-width: 820px) {
		.sidebar {
			padding-inline: var(--space-2);
		}
	}
</style>
