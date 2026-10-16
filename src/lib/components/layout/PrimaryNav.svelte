<script lang="ts">
	import { resolve } from "$app/paths";
	import BarChart3 from "~icons/lucide/bar-chart-3";
	import ClipBoardList from "~icons/lucide/clipboard-list";
	import FolderKanban from "~icons/lucide/folder-kanban";

	interface Props {
		taskCount: number;
		inProgressCount: number;
	}

	let { taskCount, inProgressCount }: Props = $props();
</script>

<nav class="primary-nav" aria-label="Primary navigation">
	<a class="nav-item active" href={resolve("/")}>
		<ClipBoardList /> Tasks
		<span class="nav-count">{taskCount}</span>
	</a>
	<a class="nav-item" href={resolve("/kanban")}>
		<FolderKanban /> Kanban
		<span class="nav-count">{inProgressCount}</span>
	</a>
	<button class="nav-item">
		<BarChart3 /> Statistics
	</button>
</nav>
