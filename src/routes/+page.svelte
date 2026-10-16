<script lang="ts">
	import SideBar from "#lib/components/layout/SideBar.svelte";
	import NewTask from "#lib/components/NewTask.svelte";
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
		type Project,
		type Status,
		type Task,
	} from "#lib/types.ts";
	import Check from "~icons/lucide/check";
	import ChevronDown from "~icons/lucide/chevron-down";
	import FolderKanban from "~icons/lucide/folder-kanban";
	import Moon from "~icons/lucide/moon";
	import PanelLeftClose from "~icons/lucide/panel-left-close";
	import Plus from "~icons/lucide/plus";
	import Sun from "~icons/lucide/sun";
	import Tag from "~icons/lucide/tag";
	import X from "~icons/lucide/x";

	const loadedProjects = await getProjects({ includeArchived: true });
	const loaded = await getTasks({ limit: 1000 });

	let override = $state<"light" | "dark" | null>(null);
	let systemLight = $state(false);
	let status = $state<Status | "all">("all");
	let priority = $state<Priority | "all">("all");
	let epic = $state("any");
	let query = $state("");
	let selected: Task | null = $state(null);
	let tasks = $state<Task[]>(loaded);
	let projects = $state<Project[]>(loadedProjects);
	let creating = $state(false);
	let tagsOpen = $state(false);
	let selectedTags = $state<string[]>([]);
	let tagFilter = $state<HTMLElement | null>(null);

	const tagCount = $derived(new Set(tasks.flatMap((task) => task.tags)).size);
	const allTags = $derived.by(() => {
		const counts = new Map<string, number>();

		for (const task of tasks) {
			for (const tag of task.tags) {
				counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}

		return [...counts.entries()]
			.map(([tag, count]) => ({ tag, count }))
			.sort((left, right) => left.tag.localeCompare(right.tag));
	});
	const epics = $derived(tasks.filter((task) => task.is_epic));
	const activeProjects = $derived(
		projects.filter((project) => project.archived_at === null),
	);
	const appearance = $derived(override ?? (systemLight ? "light" : "dark"));
	const themeClass = $derived(override === null ? "" : `theme-${override}`);

	$effect(() => {
		const media = window.matchMedia("(prefers-color-scheme: light)");
		const sync = () => (systemLight = media.matches);

		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	});

	$effect(() => {
		if (!tagsOpen) return;

		function onPointerDown(event: PointerEvent) {
			if (tagFilter !== null && !tagFilter.contains(event.target as Node)) {
				tagsOpen = false;
			}
		}

		function onKeydown(event: KeyboardEvent) {
			if (event.key === "Escape") tagsOpen = false;
		}

		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeydown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeydown);
		};
	});

	function toggleTag(tag: string) {
		selectedTags = selectedTags.includes(tag)
			? selectedTags.filter((item) => item !== tag)
			: [...selectedTags, tag];
	}

	function clearTags() {
		selectedTags = [];
	}

	function epicCount(epicId: string): number {
		return tasks.filter((task) => task.epic_id === epicId).length;
	}

	const visibleTasks = $derived.by(() => {
		const needle = query.trim().toLowerCase();

		return tasks.filter((task) => {
			if (status !== "all" && task.status !== status) return false;
			if (priority !== "all" && task.priority !== priority) return false;
			if (epic === "none" && task.epic_id !== null) return false;
			if (epic !== "any" && epic !== "none" && task.epic_id !== epic) {
				return false;
			}
			if (
				selectedTags.length > 0 &&
				!selectedTags.some((tag) => task.tags.includes(tag))
			) {
				return false;
			}
			if (needle === "") return true;

			return (
				task.id.toLowerCase().includes(needle) ||
				task.title.toLowerCase().includes(needle) ||
				task.description.toLowerCase().includes(needle)
			);
		});
	});

	function toggleTheme() {
		override = appearance === "light" ? "dark" : "light";
	}

	function clearFilters() {
		status = "all";
		priority = "all";
		epic = "any";
		query = "";
		selectedTags = [];
	}

	function applyUpdate(updated: Task) {
		tasks = tasks.map((task) => (task.id === updated.id ? updated : task));
	}

	function applyMove(oldId: string, task: Task) {
		tasks = tasks.map((item) => (item.id === oldId ? task : item));
	}

	function addTask(task: Task) {
		tasks = [task, ...tasks];
		selected = task;
	}

	function addProject(project: Project) {
		projects = sortProjects([...projects, project]);
	}

	function removeTask(id: string) {
		tasks = tasks.filter((task) => task.id !== id);
		if (epic === id) {
			epic = "any";
		}
	}

	function updateProjectInList(updated: Project) {
		projects = sortProjects(
			projects.map((project) =>
				project.id === updated.id ? updated : project,
			),
		);
	}

	function sortProjects(list: Project[]) {
		return [...list].sort((left, right) => left.name.localeCompare(right.name));
	}

	function openNewTask() {
		creating = true;
	}
</script>

<main class={`app-shell ${themeClass}`}>
	<SideBar
		{projects}
		{tasks}
		onprojectcreated={addProject}
		onprojectupdated={updateProjectInList}
	/>

	<section class={`workspace ${selected ? "with-detail compact-table" : ""}`}>
		<header class="workspace-header">
			<div class="title-row">
				<h1>Projects</h1>
				<div class="header-actions">
					<button
						class="icon-button"
						onclick={toggleTheme}
						aria-label={appearance === "light"
							? "Switch to dark theme"
							: "Switch to light theme"}
					>
						{#if appearance === "light"}
							<Moon />
						{:else}
							<Sun />
						{/if}
					</button>
					<button class="icon-button" aria-label="Collapse sidebar">
						<PanelLeftClose />
					</button>
					<button class="new-task" onclick={openNewTask}>
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
					<span class="filter-label">Status</span>
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
					<span class="filter-label">Priority</span>
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
				<label class="select-filter">
					<FolderKanban />
					<select bind:value={epic} aria-label="Filter by epic">
						<option value="any">Epic: any</option>
						<option value="none">Epic: none</option>
						{#each epics as epicTask (epicTask.id)}
							<option value={epicTask.id}>
								{epicTask.id} — {epicTask.title} ({epicCount(epicTask.id)})
							</option>
						{/each}
					</select>
					<ChevronDown />
				</label>
				<div class="tag-filter" bind:this={tagFilter}>
					<button
						class="select-filter"
						class:active={selectedTags.length > 0}
						onclick={() => (tagsOpen = !tagsOpen)}
						aria-haspopup="true"
						aria-expanded={tagsOpen}
					>
						<Tag /> Tags
						<strong>
							({selectedTags.length > 0
								? `${selectedTags.length}/${tagCount}`
								: tagCount})
						</strong>
						<ChevronDown />
					</button>
					{#if tagsOpen}
						<div class="tag-menu" role="menu">
							{#if allTags.length === 0}
								<p class="tag-menu-empty">No tags yet</p>
							{:else}
								{#each allTags as item (item.tag)}
									<button
										class="tag-option"
										class:active={selectedTags.includes(item.tag)}
										role="menuitemcheckbox"
										aria-checked={selectedTags.includes(item.tag)}
										onclick={() => toggleTag(item.tag)}
									>
										<span class="tag-option-check">
											{#if selectedTags.includes(item.tag)}
												<Check />
											{/if}
										</span>
										<span class="tag-option-name">#{item.tag}</span>
										<span class="tag-option-count">{item.count}</span>
									</button>
								{/each}
								{#if selectedTags.length > 0}
									<button class="tag-menu-clear" onclick={clearTags}>
										Clear tags
									</button>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
				<span class="result-count">
					{visibleTasks.length} visible / {tasks.length} total
				</span>
			</div>
		</header>
		<Table
			tasks={visibleTasks}
			bind:selected
			total={tasks.length}
			onclear={clearFilters}
			onnew={openNewTask}
			onepic={(id) => (epic = id)}
		/>
	</section>
	<Selected
		bind:selected
		{epics}
		{projects}
		onchange={applyUpdate}
		onmove={applyMove}
		ondelete={removeTask}
	/>
	<NewTask
		bind:open={creating}
		projects={activeProjects}
		{epics}
		oncreated={addTask}
		onprojectcreated={addProject}
	/>
</main>
