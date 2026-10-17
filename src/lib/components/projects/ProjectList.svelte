<script lang="ts">
	import { countActiveTasksInProject } from "#lib/tasks/filter.ts";
	import type { Project, Task } from "#lib/types.ts";
	import ProjectItem from "./ProjectItem.svelte";
	import ProjectRow from "./ProjectRow.svelte";

	interface Props {
		projects: Project[];
		tasks: Task[];
		activeProject: string;
		onselect: (projectId: string) => void;
		onarchive: (project: Project) => void;
		onsettings: (project: Project) => void;
	}

	let {
		projects,
		tasks,
		activeProject,
		onselect,
		onarchive,
		onsettings,
	}: Props = $props();
</script>

<div class="project-all">
	<ProjectItem
		active={activeProject === "all"}
		count={countActiveTasksInProject(tasks, "all")}
		onselect={() => onselect("all")}
	>
		All projects
	</ProjectItem>
</div>

{#each projects as project (project.id)}
	<ProjectRow
		{project}
		active={activeProject === project.id}
		count={countActiveTasksInProject(tasks, project.id)}
		onselect={() => onselect(project.id)}
		onarchive={() => onarchive(project)}
		onsettings={() => onsettings(project)}
	/>
{/each}

<style>
	.project-all {
		display: flex;
		margin-bottom: var(--space-1);
	}
</style>
