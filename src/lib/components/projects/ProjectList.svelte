<script lang="ts">
	import { projectActive } from "#lib/tasks/counts.ts";
	import type { Project, ProjectFilter } from "#lib/types.ts";
	import ProjectItem from "./ProjectItem.svelte";
	import ProjectRow from "./ProjectRow.svelte";

	interface Props {
		projects: Project[];
		totalTasks: number;
		activeProject: ProjectFilter;
		selectionProjectId?: string | null;
		onselect: (projectId: ProjectFilter) => void;
		onarchive: (project: Project) => void;
		onsettings: (project: Project) => void;
	}

	let {
		projects,
		totalTasks,
		activeProject,
		selectionProjectId = null,
		onselect,
		onarchive,
		onsettings,
	}: Props = $props();
</script>

<div class="project-all">
	<ProjectItem
		active={activeProject === null}
		count={totalTasks}
		onselect={() => onselect(null)}
	>
		All projects
	</ProjectItem>
</div>

{#each projects as project (project.id)}
	<ProjectRow
		{project}
		active={activeProject === project.id}
		selection={project.id === selectionProjectId &&
			project.id !== activeProject}
		count={projectActive(project)}
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
