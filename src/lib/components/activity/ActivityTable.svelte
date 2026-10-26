<script lang="ts">
	import ActivityRow from "#lib/components/activity/ActivityRow.svelte";
	import type { ActivityRowItem } from "#lib/activity/rows.ts";

	interface Props {
		items: ActivityRowItem[];
		showEntity?: boolean;
	}

	let { items, showEntity = false }: Props = $props();
</script>

<table>
	<thead>
		<tr>
			<th class="when-col">When</th>
			<th class="source-col">Source</th>
			<th class="op-col">Operation</th>
			{#if showEntity}
				<th class="entity-col">Entity</th>
			{/if}
			<th>Fields</th>
		</tr>
	</thead>
	<tbody>
		{#each items as item, index (index)}
			<ActivityRow {item} {showEntity} />
		{/each}
	</tbody>
</table>

<style>
	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--surface);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}

	.when-col,
	.source-col,
	.op-col {
		width: 1%;
		white-space: nowrap;
	}

	.entity-col {
		width: 1%;
	}
</style>
