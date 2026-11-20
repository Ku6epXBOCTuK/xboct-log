<script lang="ts">
	import AppBar from "#lib/components/layout/AppBar.svelte";
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
	<AppBar>
		{#snippet leading()}
			<h1>Kanban</h1>
		{/snippet}
	</AppBar>

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
