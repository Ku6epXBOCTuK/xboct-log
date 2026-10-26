<script lang="ts">
	import ActivityFields from "#lib/components/activity/ActivityFields.svelte";
	import ActivitySource from "#lib/components/activity/ActivitySource.svelte";
	import { activityOpLabel } from "#lib/activity/labels.ts";
	import type { ActivityRowItem } from "#lib/activity/rows.ts";
	import { formatDateTime } from "#lib/tasks/display.ts";

	interface Props {
		item: ActivityRowItem;
		showEntity: boolean;
	}

	let { item, showEntity }: Props = $props();
</script>

<tr>
	<td class="when">{formatDateTime(item.ts)}</td>
	<td>
		<ActivitySource source={item.source} client={item.client} />
	</td>
	<td class="op">
		{activityOpLabel(item.op)}
		{#if !showEntity && item.old_id !== null}
			<span class="was">was {item.old_id}</span>
		{/if}
	</td>
	{#if showEntity}
		<td class="entity">
			<span class="entity-type">{item.entity}</span>
			<span class="entity-id">{item.entity_id}</span>
			{#if item.old_id !== null}
				<span class="was">was {item.old_id}</span>
			{/if}
		</td>
	{/if}
	<td class="fields">
		<ActivityFields changes={item.changes} fields={item.fields} />
	</td>
</tr>

<style>
	td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
		vertical-align: top;
	}

	.when {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.op {
		white-space: nowrap;
	}

	.entity {
		white-space: nowrap;
	}

	.entity-type {
		color: var(--text-muted);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-right: var(--space-2);
	}

	.entity-id {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.was {
		display: block;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.fields {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
</style>
