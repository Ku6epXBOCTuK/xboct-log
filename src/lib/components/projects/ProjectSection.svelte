<script lang="ts">
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import type { Project, Task } from "#lib/types.ts";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import ChevronDown from "~icons/lucide/chevron-down";
	import Plus from "~icons/lucide/plus";
	import ProjectCreateForm from "./ProjectCreateForm.svelte";
	import ProjectList from "./ProjectList.svelte";

	interface Props {
		projects: ProjectStore;
		tasks: Task[];
		activeProject: string;
		onselect: (projectId: string) => void;
	}

	let { projects, tasks, activeProject, onselect }: Props = $props();

	let open = $state(true);
	let showArchived = $state(false);
	let creating = $state(false);
	let failure = $state<string | null>(null);

	const visible = $derived(showArchived ? projects.all : projects.active);

	async function rename(id: string, name: string) {
		failure = null;
		try {
			await projects.rename(id, name);
		} catch (error) {
			failure = messageOf(error);
		}
	}

	async function toggleArchived(project: Project) {
		failure = null;
		try {
			await projects.setArchived(project.id, project.archived_at === null);
		} catch (error) {
			failure = messageOf(error);
		}
	}
</script>

<div class="projects-heading">
	<button
		class="section-toggle"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<ChevronDown class={open ? "" : "-rotate-90"} data-icon="inline-start" />
		Projects
	</button>
	<span>{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</span>
	<button
		class="project-icon"
		onclick={() => {
			creating = !creating;
			failure = null;
		}}
		aria-label="New project"
		aria-expanded={creating}
	>
		<Plus />
	</button>
</div>
{#if open}
	<div class="project-list">
		{#if creating}
			<ProjectCreateForm {projects} onclose={() => (creating = false)} />
		{/if}
		<p class="project-hint">
			{projects.active.length} active · {projects.archived.length} archived
		</p>
		<ErrorNote message={failure} class="project-error" />
		<ProjectList
			projects={visible}
			{tasks}
			{activeProject}
			{onselect}
			onrename={rename}
			onarchive={toggleArchived}
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
