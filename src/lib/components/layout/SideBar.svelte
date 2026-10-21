<script lang="ts">
	import ProjectSection from "#lib/components/projects/ProjectSection.svelte";
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import { countInProgress } from "#lib/tasks/filter.ts";
	import type { ProjectFilter } from "#lib/types.ts";
	import ChevronDown from "~icons/lucide/chevron-down";
	import ChevronUp from "~icons/lucide/chevron-up";
	import BackupControl from "./BackupControl.svelte";
	import BrandMark from "./BrandMark.svelte";
	import PrimaryNav from "./PrimaryNav.svelte";

	interface Props {
		projects: ProjectStore;
		scopes: ScopeStore;
		tasks: TaskStore;
		activeProject: ProjectFilter;
		onprojectselect?: (projectId: ProjectFilter) => void;
	}

	let { projects, scopes, tasks, activeProject, onprojectselect }: Props =
		$props();

	let navOpen = $state(false);
</script>

<aside class="sidebar">
	<div class="sidebar-head">
		<BrandMark compact />
		<IconButton
			label={navOpen ? "Show only the current page" : "Show all pages"}
			expanded={navOpen}
			onclick={() => (navOpen = !navOpen)}
		>
			{#if navOpen}
				<ChevronUp />
			{:else}
				<ChevronDown />
			{/if}
		</IconButton>
	</div>
	<PrimaryNav
		taskCount={tasks.tasks.length}
		inProgressCount={countInProgress(tasks.tasks)}
		onlyActive={!navOpen}
	/>
	<div class="sidebar-scroll">
		<ProjectSection
			{projects}
			{scopes}
			{tasks}
			{activeProject}
			onselect={onprojectselect ?? (() => {})}
		/>
	</div>
	<BackupControl />
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
		overflow: hidden;
	}

	.sidebar-scroll {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.sidebar-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.sidebar-head :global(.icon-btn) {
		margin-right: var(--space-1);
	}

	@media (max-width: 820px) {
		.sidebar {
			padding-inline: var(--space-2);
		}

		.sidebar-head {
			position: relative;
			justify-content: center;
		}

		.sidebar-head :global(.icon-btn) {
			position: absolute;
			right: 0;
		}
	}
</style>
