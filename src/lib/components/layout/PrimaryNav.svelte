<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import Activity from "~icons/lucide/activity";
	import ArchiveRestore from "~icons/lucide/archive-restore";
	import BarChart3 from "~icons/lucide/bar-chart-3";
	import ClipBoardList from "~icons/lucide/clipboard-list";
	import DatabaseBackup from "~icons/lucide/database-backup";
	import FolderKanban from "~icons/lucide/folder-kanban";
	import { listHref } from "#lib/navigation/href.ts";
	import { parsePath } from "#lib/navigation/paths.ts";

	interface Props {
		taskCount: number;
		inProgressCount: number;
		onlyActive?: boolean;
	}

	let { taskCount, inProgressCount, onlyActive = false }: Props = $props();

	const location = $derived(parsePath(page.url.pathname));

	const project = $derived(location.project);

	const onTasks = $derived(location.category === "tasks");
	const onKanban = $derived(location.category === "kanban");
	const onActivity = $derived(location.category === "activity");
	const onDeleted = $derived(location.category === "deleted");
	const onBackups = $derived(page.url.pathname === "/backups");
</script>

<nav
	class="primary-nav"
	class:only-active={onlyActive}
	aria-label="Primary navigation"
>
	<a class="nav-item" class:active={onTasks} href={listHref("tasks", project)}>
		<ClipBoardList /> Tasks
		<span class="nav-count">{taskCount}</span>
	</a>
	<a
		class="nav-item"
		class:active={onKanban}
		href={listHref("kanban", project)}
	>
		<FolderKanban /> Kanban
		<span class="nav-count">{inProgressCount}</span>
	</a>
	<a
		class="nav-item"
		class:active={onActivity}
		href={listHref("activity", project)}
	>
		<Activity /> Activity
	</a>
	<a
		class="nav-item"
		class:active={onDeleted}
		href={listHref("deleted", project)}
	>
		<ArchiveRestore /> Deleted
	</a>
	<a class="nav-item" class:active={onBackups} href={resolve("/backups")}>
		<DatabaseBackup /> Backups
	</a>
	<button class="nav-item">
		<BarChart3 /> Statistics
	</button>
</nav>

<style>
	.primary-nav {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.nav-item {
		border: 0;
		background: transparent;
		color: var(--text-secondary);
		text-align: left;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius);
		font-size: var(--text-md);
		font-weight: 500;
		width: 100%;
		text-decoration: none;
	}

	.nav-item:hover {
		background: var(--hover);
		color: var(--foreground);
	}

	.nav-item :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: none;
	}

	.nav-item.active {
		color: var(--foreground);
		background: var(--selected);
	}

	.only-active .nav-item:not(.active) {
		display: none;
	}

	.nav-count {
		margin-left: auto;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.nav-item:hover .nav-count,
	.nav-item.active .nav-count {
		color: var(--foreground);
	}

	@container sidebar (max-width: 6rem) {
		.nav-item {
			justify-content: center;
			gap: 0;
			font-size: 0;
			padding: 0;
			aspect-ratio: 1;
		}

		.only-active .nav-item:not(.active) {
			display: flex;
		}

		.nav-item :global(svg) {
			width: 1.125rem;
			height: 1.125rem;
		}

		.nav-count {
			display: none;
		}
	}
</style>
