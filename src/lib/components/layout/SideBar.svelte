<script lang="ts">
	import Check from "#lib/components/Check.svelte";
	import Trash2 from "#lib/components/Trash2.svelte";
	import { PROJECTS } from "#lib/tasks/mocks.ts";
	import { resolve } from "$app/paths";
	import BarChart3 from "~icons/lucide/bar-chart-3";
	import ChevronDown from "~icons/lucide/chevron-down";
	import ClipBoardList from "~icons/lucide/clipboard-list";
	import FolderKanban from "~icons/lucide/folder-kanban";

	let projectsOpen = $state(true);
	let activeProject = $state("");

	function toggleProjectsOpen() {
		projectsOpen = !projectsOpen;
	}

	function setActiveProject(projectName: string) {
		activeProject = activeProject === projectName ? "all" : projectName;
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
			<span class="nav-count">24</span>
		</a>
		<a class="nav-item" href={resolve("/kanban")}>
			<FolderKanban /> Kanban
			<span class="nav-count">4</span>
		</a>
		<button class="nav-item">
			<BarChart3 /> Statistics
			<span class="nav-alert">2</span>
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
		<span>27 tasks</span>
	</div>
	{#if projectsOpen}
		<div class="project-list">
			<p class="project-hint">3 of 3 projects included — checked</p>
			{#each PROJECTS as { name, count } (name)}
				<button
					onclick={() => setActiveProject(name)}
					class={`project-item ${activeProject === name ? "selected" : ""}`}
				>
					<span class="project-check">
						<Check />
					</span>
					<span>{name}</span>
					<span class="project-count">{count}</span>
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
