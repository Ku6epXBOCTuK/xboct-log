<script lang="ts">
	import { projectCounts, type CountGroups } from "#lib/tasks/counts.ts";
	import type { Project, ProjectFilter } from "#lib/types.ts";
	import ProjectItem from "./ProjectItem.svelte";
	import ProjectRow from "./ProjectRow.svelte";

	interface Props {
		projects: Project[];
		totals: CountGroups;
		activeProject: ProjectFilter;
		selectionProjectId?: string | null;
		onselect: (projectId: ProjectFilter) => void;
		onarchive: (project: Project) => void;
		onsettings: (project: Project) => void;
	}

	let {
		projects,
		totals,
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
		counts={totals}
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
		counts={projectCounts(project)}
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
