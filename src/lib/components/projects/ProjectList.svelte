<script lang="ts">
	import { countTasksInProject } from "#lib/tasks/filter.ts";
	import type { Project, Task } from "#lib/types.ts";
	import ProjectRow from "./ProjectRow.svelte";

	interface Props {
		projects: Project[];
		tasks: Task[];
		activeProject: string;
		onselect: (projectId: string) => void;
		onrename: (id: string, name: string) => void;
		onarchive: (project: Project) => void;
		onsettings: (project: Project) => void;
	}

	let {
		projects,
		tasks,
		activeProject,
		onselect,
		onrename,
		onarchive,
		onsettings,
	}: Props = $props();
</script>

{#each projects as project (project.id)}
	<ProjectRow
		{project}
		active={activeProject === project.id}
		count={countTasksInProject(tasks, project.id)}
		onselect={() => onselect(project.id)}
		onrename={(name) => onrename(project.id, name)}
		onarchive={() => onarchive(project)}
		onsettings={() => onsettings(project)}
	/>
{/each}
