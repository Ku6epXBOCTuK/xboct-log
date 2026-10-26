<script lang="ts">
	import type { Status } from "#lib/types.ts";

	const COLUMNS: { status: Status; label: string }[] = [
		{ status: "backlog", label: "Backlog" },
		{ status: "open", label: "Open" },
		{ status: "in-progress", label: "In progress" },
		{ status: "blocked", label: "Blocked" },
		{ status: "done", label: "Done" },
	];
</script>

<section class="kanban-workspace">
	<header class="kanban-header">
		<h1>Kanban</h1>
	</header>

	<div class="kanban-board">
		{#each COLUMNS as column (column.status)}
			<div class={`kanban-column ${column.status}`}>
				<div class="column-header">
					<div>
						<span class="column-status-dot"></span>
						<h2>{column.label}</h2>
					</div>
				</div>
				<div class="column-cards"></div>
			</div>
		{/each}
	</div>
</section>

<style>
	.kanban-header {
		flex: none;
		padding: var(--edge-pad) var(--edge-pad) 0;
	}

	.kanban-header h1 {
		margin: 0;
		font-size: var(--text-2xl);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}
</style>
