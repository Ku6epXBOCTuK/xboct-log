<script lang="ts">
	import { countInProgress } from "#lib/tasks/filter.ts";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { Task } from "#lib/types.ts";
	import ProjectSection from "#lib/components/projects/ProjectSection.svelte";
	import BrandMark from "./BrandMark.svelte";
	import LanguageSwitch from "./LanguageSwitch.svelte";
	import PrimaryNav from "./PrimaryNav.svelte";

	interface Props {
		projects: ProjectStore;
		tasks: Task[];
		activeProject: string;
		onprojectselect?: (projectId: string) => void;
	}

	let { projects, tasks, activeProject, onprojectselect }: Props = $props();
</script>

<aside class="sidebar">
	<BrandMark />
	<PrimaryNav
		taskCount={tasks.length}
		inProgressCount={countInProgress(tasks)}
	/>
	<ProjectSection
		{projects}
		{tasks}
		{activeProject}
		onselect={onprojectselect ?? (() => {})}
	/>
	<LanguageSwitch />
</aside>
