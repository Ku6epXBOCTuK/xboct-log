<script lang="ts">
	import { page } from "$app/state";
	import { resolve } from "$app/paths";
	import Activity from "~icons/lucide/activity";
	import ArchiveRestore from "~icons/lucide/archive-restore";
	import BarChart3 from "~icons/lucide/bar-chart-3";
	import ClipBoardList from "~icons/lucide/clipboard-list";
	import FolderKanban from "~icons/lucide/folder-kanban";

	interface Props {
		taskCount: number;
		inProgressCount: number;
		onlyActive?: boolean;
	}

	let { taskCount, inProgressCount, onlyActive = false }: Props = $props();

	const onTasks = $derived(page.url.pathname === "/");
	const onKanban = $derived(page.url.pathname === "/kanban");
	const onActivity = $derived(page.url.pathname === "/activity");
	const onDeleted = $derived(page.url.pathname === "/deleted");
</script>

<nav
	class="primary-nav"
	class:only-active={onlyActive}
	aria-label="Primary navigation"
>
	<a class="nav-item" class:active={onTasks} href={resolve("/")}>
		<ClipBoardList /> Tasks
		<span class="nav-count">{taskCount}</span>
	</a>
	<a class="nav-item" class:active={onKanban} href={resolve("/kanban")}>
		<FolderKanban /> Kanban
		<span class="nav-count">{inProgressCount}</span>
	</a>
	<a class="nav-item" class:active={onActivity} href={resolve("/activity")}>
		<Activity /> Activity
	</a>
	<a class="nav-item" class:active={onDeleted} href={resolve("/deleted")}>
		<ArchiveRestore /> Deleted
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
