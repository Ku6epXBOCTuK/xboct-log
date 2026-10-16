<script lang="ts">
	import Check from "#lib/components/Check.svelte";
	import { createProject, updateProject } from "#lib/remote/projects.remote.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import { INBOX_PROJECT_ID, type Project, type Task } from "#lib/types.ts";
	import { resolve } from "$app/paths";
	import BarChart3 from "~icons/lucide/bar-chart-3";
	import ChevronDown from "~icons/lucide/chevron-down";
	import ClipBoardList from "~icons/lucide/clipboard-list";
	import FolderKanban from "~icons/lucide/folder-kanban";
	import Pencil from "~icons/lucide/pencil";
	import Plus from "~icons/lucide/plus";
	import Trash2 from "~icons/lucide/trash-2";

	interface Props {
		projects: Project[];
		tasks: Task[];
		activeProject: string;
		onprojectselect?: (projectId: string) => void;
		onprojectcreated?: (project: Project) => void;
		onprojectupdated?: (project: Project) => void;
	}

	let {
		projects,
		tasks,
		activeProject,
		onprojectselect,
		onprojectcreated,
		onprojectupdated,
	}: Props = $props();

	let projectsOpen = $state(true);
	let showArchived = $state(false);
	let creatingProject = $state(false);
	let creating = $state(false);
	let newProjectId = $state("");
	let newProjectName = $state("");
	let newProjectPrefix = $state("");
	let renamingId = $state<string | null>(null);
	let renameInput = $state<HTMLInputElement | null>(null);
	let failure = $state<string | null>(null);

	const activeProjects = $derived(
		projects.filter((project) => project.archived_at === null),
	);
	const archivedProjects = $derived(
		projects.filter((project) => project.archived_at !== null),
	);
	const visibleProjects = $derived(showArchived ? projects : activeProjects);
	const inProgressCount = $derived(
		tasks.filter((task) => task.status === "in-progress").length,
	);

	$effect(() => {
		if (renamingId !== null) {
			renameInput?.focus();
		}
	});

	function toggleProjectsOpen() {
		projectsOpen = !projectsOpen;
	}

	function selectProject(projectId: string) {
		onprojectselect?.(activeProject === projectId ? "all" : projectId);
	}

	function countInProject(projectId: string) {
		return tasks.filter((task) => task.project_id === projectId).length;
	}

	function toggleCreateProject() {
		creatingProject = !creatingProject;
		failure = null;
	}

	function cancelCreateProject() {
		creatingProject = false;
		newProjectId = "";
		newProjectName = "";
		newProjectPrefix = "";
		failure = null;
	}

	async function submitProject(event: SubmitEvent) {
		event.preventDefault();

		const id = newProjectId.trim();
		const name = newProjectName.trim();
		const prefix = newProjectPrefix.trim();
		if (id === "" || name === "" || prefix === "") {
			failure = "id, name and prefix are required";
			return;
		}

		creating = true;
		failure = null;
		try {
			const created = await createProject({ id, name, prefix });
			onprojectcreated?.(created);
			cancelCreateProject();
		} catch (error) {
			failure = messageOf(error);
		} finally {
			creating = false;
		}
	}

	function startRename(projectId: string) {
		renamingId = projectId;
		failure = null;
	}

	async function renameProject(id: string, name: string) {
		try {
			const updated = await updateProject({ id, patch: { name } });
			onprojectupdated?.(updated);
		} catch (error) {
			failure = messageOf(error);
		}
	}

	function endRename(event: Event, id: string) {
		if (renamingId !== id) return;

		const name = (event.currentTarget as HTMLInputElement).value.trim();
		renamingId = null;
		if (name === "") return;

		const project = projects.find((item) => item.id === id);
		if (project === undefined || project.name === name) return;

		void renameProject(id, name);
	}

	async function toggleArchived(project: Project) {
		failure = null;
		try {
			const updated = await updateProject({
				id: project.id,
				patch: { archived: project.archived_at === null },
			});
			onprojectupdated?.(updated);
		} catch (error) {
			failure = messageOf(error);
		}
	}
</script>

<aside class="sidebar">
	<div class="brand">
		<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
			<rect
				class="brand-mark-accent"
				x="3"
				y="5"
				width="18"
				height="3.5"
				rx="1.75"
			/>
			<rect x="3" y="10.25" width="13" height="3.5" rx="1.75" />
			<rect x="3" y="15.5" width="9" height="3.5" rx="1.75" />
		</svg>
		<span class="brand-word"
			>xboct<span class="brand-word-accent">-log</span></span
		>
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
			onclick={toggleProjectsOpen}
			aria-expanded={projectsOpen}
		>
			<ChevronDown
				class={projectsOpen ? "" : "-rotate-90"}
				data-icon="inline-start"
			/>
			Projects
		</button>
		<span>{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</span>
		<button
			class="project-icon"
			onclick={toggleCreateProject}
			aria-label="New project"
			aria-expanded={creatingProject}
		>
			<Plus />
		</button>
	</div>
	{#if projectsOpen}
		<div class="project-list">
			{#if creatingProject}
				<form class="project-create" onsubmit={submitProject}>
					<input
						bind:value={newProjectId}
						placeholder="id"
						aria-label="Project id"
					/>
					<input
						bind:value={newProjectName}
						placeholder="name"
						aria-label="Project name"
					/>
					<input
						bind:value={newProjectPrefix}
						placeholder="PREFIX"
						aria-label="Project prefix"
					/>
					<div class="project-create-actions">
						<button class="new-task" type="submit" disabled={creating}>
							{creating ? "creating…" : "Create"}
						</button>
						<button
							class="icon-button"
							type="button"
							onclick={cancelCreateProject}
						>
							Cancel
						</button>
					</div>
				</form>
			{/if}
			<p class="project-hint">
				{activeProjects.length} active · {archivedProjects.length} archived
			</p>
			{#if failure !== null}
				<p class="project-error">{failure}</p>
			{/if}
			{#each visibleProjects as project (project.id)}
				{#if renamingId === project.id}
					<div class="project-row">
						<input
							class="project-rename"
							value={project.name}
							aria-label={`Rename ${project.name}`}
							bind:this={renameInput}
							onchange={(event) => endRename(event, project.id)}
							onblur={(event) => endRename(event, project.id)}
						/>
					</div>
				{:else}
					<div
						class={`project-row ${activeProject === project.id ? "selected" : ""}`}
					>
						<button
							class="project-item"
							onclick={() => selectProject(project.id)}
						>
							<span class="project-check">
								<Check />
							</span>
							<span>{project.name}</span>
							<span class="project-count">{countInProject(project.id)}</span>
						</button>
						<button
							class="project-icon"
							type="button"
							onclick={() => startRename(project.id)}
							aria-label={`Rename ${project.name}`}
						>
							<Pencil />
						</button>
						{#if project.id !== INBOX_PROJECT_ID}
							<button
								class="project-icon"
								type="button"
								onclick={() => toggleArchived(project)}
								aria-label={project.archived_at === null
									? `Archive ${project.name}`
									: `Restore ${project.name}`}
							>
								<Trash2 class="delete-icon" />
							</button>
						{/if}
					</div>
				{/if}
			{/each}
			{#if archivedProjects.length > 0}
				<button
					class="project-archived-toggle"
					onclick={() => (showArchived = !showArchived)}
				>
					{showArchived
						? "Hide archived"
						: `Show archived (${archivedProjects.length})`}
				</button>
			{/if}
		</div>
	{/if}
	<div class="language-switch">
		<button>RU</button>
		<button class="active">EN</button>
	</div>
</aside>
