<script lang="ts">
	import SideBar from "#lib/components/layout/SideBar.svelte";
	import Search from "#lib/components/Search.svelte";
	import Selected from "#lib/components/Selected.svelte";
	import Table from "#lib/components/Table.svelte";
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import {
		PRIORITY_OPTIONS_LIST,
		STATUS_OPTIONS_LIST,
		tasks,
		type Task,
	} from "#lib/tasks/mocks.ts";
	import ChevronDown from "~icons/lucide/chevron-down";
	import FolderKanban from "~icons/lucide/folder-kanban";
	import Moon from "~icons/lucide/moon";
	import PanelLeftClose from "~icons/lucide/panel-left-close";
	import Plus from "~icons/lucide/plus";
	import Sun from "~icons/lucide/sun";
	import Tag from "~icons/lucide/tag";
	import X from "~icons/lucide/x";

	let lightTheme = $state(false);
	let status = $state("all");
	let priority = $state("all");
	let query = $state("");
	let selected: Task | null = $state(null);
	let filteredTasks = $state(tasks);

	function toggleTheme() {
		lightTheme = !lightTheme;
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
	<SideBar />

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
		<Table {filteredTasks} bind:selected />
	</section>
	<Selected bind:selected />
</main>
