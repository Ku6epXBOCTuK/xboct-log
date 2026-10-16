<script lang="ts">
	import SideBar from "#lib/components/layout/SideBar.svelte";
	import Search from "#lib/components/Search.svelte";
	import Selected from "#lib/components/Selected.svelte";
	import Table from "#lib/components/Table.svelte";
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { getProjects } from "#lib/remote/projects.remote.ts";
	import { getTasks } from "#lib/remote/tasks.remote.ts";
	import { STATUS_LABELS } from "#lib/tasks/display.ts";
	import {
		PRIORITIES,
		STATUSES,
		type Priority,
		type Status,
		type Task,
	} from "#lib/types.ts";
	import ChevronDown from "~icons/lucide/chevron-down";
	import FolderKanban from "~icons/lucide/folder-kanban";
	import Moon from "~icons/lucide/moon";
	import PanelLeftClose from "~icons/lucide/panel-left-close";
	import Plus from "~icons/lucide/plus";
	import Sun from "~icons/lucide/sun";
	import Tag from "~icons/lucide/tag";
	import X from "~icons/lucide/x";

	const tasks = await getTasks({ limit: 1000 });
	const projects = await getProjects();

	let lightTheme = $state(false);
	let status = $state<Status | "all">("all");
	let priority = $state<Priority | "all">("all");
	let query = $state("");
	let selected: Task | null = $state(null);

	const tagCount = $derived(new Set(tasks.flatMap((task) => task.tags)).size);

	const visibleTasks = $derived.by(() => {
		const needle = query.trim().toLowerCase();

		return tasks.filter((task) => {
			if (status !== "all" && task.status !== status) return false;
			if (priority !== "all" && task.priority !== priority) return false;
			if (needle === "") return true;

			return (
				task.id.toLowerCase().includes(needle) ||
				task.title.toLowerCase().includes(needle) ||
				task.description.toLowerCase().includes(needle)
			);
		});
	});

	function toggleTheme() {
		lightTheme = !lightTheme;
	}

	function clearFilters() {
		status = "all";
		priority = "all";
		query = "";
	}
</script>

<main class={`app-shell ${lightTheme ? "theme-light" : ""}`}>
	<SideBar {projects} {tasks} />

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
					{#each STATUSES as option (option)}
						<button
							onclick={() => (status = status === option ? "all" : option)}
							class={`filter-chip ${status === option ? "active" : ""}`}
						>
							<StatusDot status={option} />
							{STATUS_LABELS[option]}
						</button>
					{/each}
				</div>
				<div class="filter-group priority-group">
					<span class="filter-label">PRIORITY</span>
					{#each PRIORITIES as option (option)}
						<button
							onclick={() => (priority = priority === option ? "all" : option)}
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
					<Tag /> Tags <strong>({tagCount})</strong>
					<ChevronDown />
				</button>
				<span class="result-count">
					{visibleTasks.length} visible / {tasks.length} total
				</span>
			</div>
		</header>
		<Table tasks={visibleTasks} bind:selected />
	</section>
	<Selected bind:selected />
</main>
