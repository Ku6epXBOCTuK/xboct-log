<script lang="ts">
	import BarChart3 from "#lib/components/BarChart3.svelte";
	import Check from "#lib/components/Check.svelte";
	import ClipBoardList from "#lib/components/ClipBoardList.svelte";
	import FolderKanban from "#lib/components/FolderKanban.svelte";
	import Inbox from "#lib/components/Inbox.svelte";
	import PanelLeftClose from "#lib/components/PanelLeftClose.svelte";
	import Search from "#lib/components/Search.svelte";
	import StatusDot from "#lib/components/StatusDot.svelte";
	import Table from "#lib/components/Table.svelte";
	import Trash2 from "#lib/components/Trash2.svelte";
	import {
		PRIORITY_OPTIONS_LIST,
		STATUS_OPTIONS_LIST,
		tasks,
	} from "#lib/tasks/mocks.ts";
	import { resolve } from "$app/paths";
	import ChevronDown from "~icons/lucide/chevron-down";
	import Moon from "~icons/lucide/moon";
	import Plus from "~icons/lucide/plus";
	import Sun from "~icons/lucide/sun";
	import Tag from "~icons/lucide/tag";
	import X from "~icons/lucide/x";

	let lightTheme = $state(false);
	let projectsOpen = $state(false);
	let activeProject = $state("");
	let count = $state(0);
	let status = $state("all");
	let priority = $state("all");
	let query = $state("");
	let selected = $state(false);
	let filteredTasks = $state(tasks);

	function toggleProjectsOpen() {
		projectsOpen = !projectsOpen;
	}

	function toggleTheme() {
		lightTheme = !lightTheme;
	}

	function setActiveProject(projectName: string) {
		activeProject = activeProject === projectName ? "all" : projectName;
	}

	function setStatus(option: string) {
		status = option === status ? "all" : option;
	}

	function setPriority(option: string) {
		priority = option === status ? "all" : option;
	}

	function clearFilters() {}
</script>

<main class={`app-shell ${lightTheme ? "theme-light" : ""}`}>
	<aside class="sidebar">
		<div class="brand">
			<span>backlog</span>
			<i>.</i>
		</div>
		<nav class="primary-nav" aria-label="Primary navigation">
			<a class="nav-item active" href={resolve("/")}>
				<ClipBoardList data-icon="inline-start" /> Tasks
				<span class="nav-count">24</span>
			</a>
			<a class="nav-item" href={resolve("/kanban")}>
				<FolderKanban data-icon="inline-start" /> Kanban
				<span class="nav-count">4</span>
			</a>
			<button class="nav-item">
				<BarChart3 data-icon="inline-start" /> Statistics
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
				{#each [["billing-api", "9"], ["design-kit", "3"], ["shop-web", "15"]] as project (project[0])}
					<button
						onclick={() => setActiveProject(project[0])}
						class={`project-item ${activeProject === project[0] ? "selected" : ""}`}
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
		<div class="sidebar-note">
			<div>
				<Inbox /> No code graph: 3 projects
			</div>
			<code>
				code-review-graph build — check
				<br />
				candidates are less precise
			</code>
		</div>
		<div class="language-switch">
			<button>RU</button>
			<button class="active">EN</button>
		</div>
	</aside>

	<section class={`workspace ${selected ? "with-detail compact-table" : ""}`}>
		<header class="workspace-header">
			<div class="title-row">
				<div>
					<p class="eyebrow">WORKSPACE / TASKS</p>
					<h1>Projects</h1>
				</div>
				<div class="header-actions">
					<button
						class="icon-button"
						onclick={toggleTheme}
						aria-label={lightTheme
							? "Switch to dark theme"
							: "Switch to light theme"}
					>
						{#if lightTheme}
							<Moon />
						{:else}
							<Sun />
						{/if}
					</button>
					<button class="icon-button" aria-label="Collapse sidebar">
						<PanelLeftClose />
					</button>
					<button class="new-task">
						<Plus data-icon="inline-start" /> New task
					</button>
				</div>
			</div>
			<div class="search-wrap">
				<Search />
				<input
					bind:value={query}
					placeholder="Search by title, description, and ID"
					aria-label="Search tasks"
				/>
				<kbd>/</kbd>
			</div>
			<div class="filter-row">
				<div class="filter-group">
					<span class="filter-label">STATUS</span>
					{#each STATUS_OPTIONS_LIST as option (option)}
						<button
							onclick={() => setStatus(status === option ? "all" : option)}
							class={`filter-chip ${status === option ? "active" : ""}`}
						>
							<StatusDot status={option} />
							{option}
						</button>
					{/each}
				</div>
				<div class="filter-group priority-group">
					<span class="filter-label">PRIORITY</span>
					{#each PRIORITY_OPTIONS_LIST as option (option)}
						<button
							onclick={() => setPriority(priority === option ? "all" : option)}
							class={`filter-chip priority-${option} ${priority === option ? "active" : ""}`}
						>
							{option}
						</button>
					{/each}
				</div>
				<button class="clear-filters" onclick={clearFilters}>
					<X /> Clear
				</button>
			</div>
			<div class="meta-row">
				<button class="select-filter">
					<FolderKanban /> Epic: <strong>any</strong>
					<ChevronDown />
				</button>
				<button class="select-filter">
					<Tag /> Tags <strong>(25)</strong>
					<ChevronDown />
				</button>
				<span class="result-count">
					{filteredTasks.length} visible / 27 total
				</span>
			</div>
		</header>
		<Table {filteredTasks} />
	</section>
</main>
