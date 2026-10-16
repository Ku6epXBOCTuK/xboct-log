<script lang="ts">
	import Check from "#lib/components/Check.svelte";
	import Trash2 from "#lib/components/Trash2.svelte";
	import type { Project, Task } from "#lib/types.ts";
	import { resolve } from "$app/paths";
	import BarChart3 from "~icons/lucide/bar-chart-3";
	import ChevronDown from "~icons/lucide/chevron-down";
	import ClipBoardList from "~icons/lucide/clipboard-list";
	import FolderKanban from "~icons/lucide/folder-kanban";

	interface Props {
		projects: Project[];
		tasks: Task[];
	}

	let { projects, tasks }: Props = $props();

	let projectsOpen = $state(true);
	let activeProject = $state("all");

	const inProgressCount = $derived(
		tasks.filter((task) => task.status === "in-progress").length,
	);

	function toggleProjectsOpen() {
		projectsOpen = !projectsOpen;
	}

	function setActiveProject(projectId: string) {
		activeProject = activeProject === projectId ? "all" : projectId;
	}

	function countInProject(projectId: string) {
		return tasks.filter((task) => task.project_id === projectId).length;
	}
</script>

<aside class="sidebar">
	<div class="brand">
		<span>backlog</span>
		<i>.</i>
	</div>
	<nav class="primary-nav" aria-label="Primary navigation">
		<a class="nav-item active" href={resolve("/")}>
			<ClipBoardList /> Tasks
			<span class="nav-count">{tasks.length}</span>
		</a>
		<a class="nav-item" href={resolve("/kanban")}>
			<FolderKanban /> Kanban
			<span class="nav-count">{inProgressCount}</span>
		</a>
		<button class="nav-item">
			<BarChart3 /> Statistics
		</button>
	</nav>
	<div class="projects-heading">
		<button
			class="section-toggle"
			onclick={() => toggleProjectsOpen}
			aria-expanded={projectsOpen}
		>
			<ChevronDown
				class={projectsOpen ? "" : "-rotate-90"}
				data-icon="inline-start"
			/>
			Projects
		</button>
		<span>{tasks.length} tasks</span>
	</div>
	{#if projectsOpen}
		<div class="project-list">
			<p class="project-hint">
				{projects.length} of {projects.length} projects included — checked
			</p>
			{#each projects as project (project.id)}
				<button
					onclick={() => setActiveProject(project.id)}
					class={`project-item ${activeProject === project.id ? "selected" : ""}`}
				>
					<span class="project-check">
						<Check />
					</span>
					<span>{project.name}</span>
					<span class="project-count">{countInProject(project.id)}</span>
					<Trash2 class="delete-icon" />
				</button>
			{/each}
		</div>
	{/if}
	<div class="language-switch">
		<button>RU</button>
		<button class="active">EN</button>
	</div>
</aside>
