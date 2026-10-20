<script lang="ts">
	import { page } from "$app/state";
	import { resolve } from "$app/paths";
	import Activity from "~icons/lucide/activity";
	import BarChart3 from "~icons/lucide/bar-chart-3";
	import ClipBoardList from "~icons/lucide/clipboard-list";
	import FolderKanban from "~icons/lucide/folder-kanban";

	interface Props {
		taskCount: number;
		inProgressCount: number;
	}

	let { taskCount, inProgressCount }: Props = $props();

	const onTasks = $derived(page.url.pathname === "/");
	const onKanban = $derived(page.url.pathname === "/kanban");
	const onActivity = $derived(page.url.pathname === "/activity");
</script>

<nav class="primary-nav" aria-label="Primary navigation">
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

	.nav-count {
		margin-left: auto;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 820px) {
		.nav-item {
			justify-content: center;
			font-size: 0;
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
