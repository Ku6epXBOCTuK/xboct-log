<script lang="ts">
	import { activityFieldLabel, activityOpLabel } from "#lib/activity/labels.ts";
	import { getTaskHistory } from "#lib/remote/activity.remote.ts";
	import { formatDateTime } from "#lib/tasks/display.ts";
	import type { ActivityItem, Task } from "#lib/types.ts";

	interface Props {
		task: Task;
		limit?: number;
	}

	let { task, limit = 100 }: Props = $props();

	let items = $state<ActivityItem[]>([]);
	let total = $state(0);
	let loadedKey = $state("");
	let requested = "";
	let failed = $state(false);

	$effect(() => {
		const key = `${task.id}:${task.updated_at}`;
		requested = key;
		void load(task.id, key);
	});

	async function load(id: string, key: string) {
		if (key === loadedKey) return;
		try {
			const result = await getTaskHistory({ id, limit });
			if (key !== requested) return;
			items = result.items;
			total = result.total;
			loadedKey = key;
			failed = false;
		} catch {
			if (key !== requested) return;
			failed = true;
		}
	}
</script>

<div class="history">
	{#if failed}
		<p class="history-empty">History is unavailable</p>
	{:else if items.length === 0}
		<p class="history-empty">No changes recorded yet</p>
	{:else}
		<div class="history-scroll">
			<table>
				<thead>
					<tr>
						<th class="when-col">When</th>
						<th class="source-col">Source</th>
						<th class="op-col">Operation</th>
						<th>Fields</th>
					</tr>
				</thead>
				<tbody>
					{#each items as item, index (index)}
						<tr>
							<td class="when">{formatDateTime(item.ts)}</td>
							<td>
								<span class="source" data-source={item.source}
									>{item.source}</span
								>
							</td>
							<td class="op">
								{activityOpLabel(item.op)}
								{#if item.old_id !== null}
									<span class="was">was {item.old_id}</span>
								{/if}
							</td>
							<td class="fields">
								{#if item.fields.length > 0}
									<span class="field-chip"
										>{activityFieldLabel(item.fields[0])}</span
									>
									{#each item.fields.slice(1) as field (field)}
										<span class="field-chip">{activityFieldLabel(field)}</span>
									{/each}
								{:else}
									—
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if total > items.length}
			<p class="history-note">
				Showing {items.length} of {total} entries
			</p>
		{/if}
	{/if}
</div>

<style>
	.history {
		min-width: 0;
	}

	.history-empty {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.history-scroll {
		overflow: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

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

	td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
		vertical-align: top;
	}

	tr:last-child td {
		border-bottom: 0;
	}

	.when-col {
		width: 1%;
		white-space: nowrap;
	}

	.source-col {
		width: 1%;
	}

	.op-col {
		width: 1%;
		white-space: nowrap;
	}

	.when {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.source {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}

	.source[data-source="mcp"] {
		border-color: var(--accent);
		color: var(--accent-ink);
	}

	.source[data-source="ui"] {
		color: var(--text-muted);
	}

	.op {
		white-space: nowrap;
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

	.field-chip {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--field);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.history-note {
		margin: var(--space-2) 0 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
</style>
