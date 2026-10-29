<script lang="ts">
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { StatsStore } from "#lib/state/stats.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import { type Project, type ProjectFilter } from "#lib/types.ts";
	import ChevronDown from "~icons/lucide/chevron-down";
	import Plus from "~icons/lucide/plus";
	import ProjectCreateDialog from "./ProjectCreateDialog.svelte";
	import ProjectList from "./ProjectList.svelte";
	import ProjectSettingsDialog from "./ProjectSettingsDialog.svelte";

	interface Props {
		projects: ProjectStore;
		scopes: ScopeStore;
		tasks: TaskStore;
		stats: StatsStore;
		activeProject: ProjectFilter;
		selectionProjectId?: string | null;
		onselect: (projectId: ProjectFilter) => void;
	}

	let {
		projects,
		scopes,
		tasks,
		stats,
		activeProject,
		selectionProjectId = null,
		onselect,
	}: Props = $props();

	let open = $state(true);
	let showArchived = $state(false);
	let creating = $state(false);
	let failure = $state<string | null>(null);
	let settingsFor = $state<string | null>(null);

	const visible = $derived(showArchived ? projects.all : projects.active);
	const settingsProject = $derived(
		settingsFor === null
			? null
			: (projects.all.find((project) => project.id === settingsFor) ?? null),
	);
	const totals = $derived(stats.summary);

	async function toggleArchived(project: Project) {
		failure = null;
		try {
			await projects.setArchived(project.id, project.archived_at === null);
		} catch (error) {
			failure = messageOf(error);
		}
	}
</script>

<div class="projects">
	<div class="projects-heading">
		<button
			class="section-toggle"
			onclick={() => (open = !open)}
			aria-expanded={open}
		>
			<ChevronDown class={open ? "" : "-rotate-90"} data-icon="inline-start" />
			Projects
		</button>
		<span>
			{totals.active}
			active
		</span>
		<IconButton
			label="New project"
			expanded={creating}
			onclick={() => {
				creating = !creating;
				failure = null;
			}}
		>
			<Plus />
		</IconButton>
	</div>
	{#if open}
		<div class="project-list">
			<p class="project-hint">
				{projects.active.length} active · {projects.archived.length} archived
			</p>
			<ErrorNote message={failure} class="project-error" />
			<ProjectList
				projects={visible}
				{totals}
				{activeProject}
				{selectionProjectId}
				{onselect}
				onarchive={toggleArchived}
				onsettings={(project) => (settingsFor = project.id)}
			/>
			{#if projects.archived.length > 0}
				<button
					class="project-archived-toggle"
					onclick={() => (showArchived = !showArchived)}
				>
					{showArchived
						? "Hide archived"
						: `Show archived (${projects.archived.length})`}
				</button>
			{/if}
		</div>
	{/if}
</div>

<ProjectCreateDialog
	open={creating}
	{projects}
	onclose={() => (creating = false)}
/>

<ProjectSettingsDialog
	open={settingsFor !== null}
	project={settingsProject}
	{projects}
	{scopes}
	{tasks}
	onclose={() => (settingsFor = null)}
/>

<style>
	.projects {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.projects-heading {
		flex: none;
		margin-top: var(--space-5);
		display: flex;
		align-items: center;
		background: var(--panel-strong);
		border-radius: var(--radius);
		padding-right: var(--space-1);
	}

	.projects-heading > span {
		margin-left: auto;
		font-size: var(--text-xs);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		padding-left: var(--space-2);
	}

	.section-toggle {
		border: 0;
		background: transparent;
		color: var(--foreground);
		text-align: left;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius);
		font-size: var(--text-md);
		font-weight: 600;
		flex: 1 1 auto;
		min-width: 0;
	}

	.section-toggle:hover {
		background: var(--hover);
		color: var(--foreground);
	}

	.section-toggle :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: none;
		transition: transform 0.15s ease-out;
	}

	.project-list {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-2) 0 0;
	}

	.project-hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
		line-height: 1.5;
		margin: 0 0 var(--space-3) var(--space-2);
	}

	.project-archived-toggle {
		border: 0;
		background: transparent;
		color: var(--text-muted);
		font-size: var(--text-xs);
		text-align: left;
		padding: var(--space-2) 0;
	}

	.project-archived-toggle:hover {
		color: var(--foreground);
	}

	@container sidebar (max-width: 6rem) {
		.projects-heading,
		.project-list {
			display: none;
		}
	}
</style>
