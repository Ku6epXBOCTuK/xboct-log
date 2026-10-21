<script lang="ts">
	import { getTaskRevisions } from "#lib/remote/revisions.remote.ts";
	import { fetchFresh } from "#lib/remote/fresh.ts";
	import { formatDateTime } from "#lib/tasks/display.ts";
	import type { Task, TaskRevision } from "#lib/types.ts";

	interface Props {
		task: Task;
		limit?: number;
	}

	let { task, limit = 50 }: Props = $props();

	let items = $state<TaskRevision[]>([]);
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
			const result = await fetchFresh(getTaskRevisions({ id, limit }));
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

<div class="revisions">
	{#if failed}
		<p class="revisions-empty">Previous versions are unavailable</p>
	{:else if items.length === 0}
		<p class="revisions-empty">No previous versions</p>
	{:else}
		<div class="revision-list">
			{#each items as revision (revision.id)}
				<details class="revision">
					<summary>
						<span class="field">{revision.field}</span>
						<span class="when">{formatDateTime(revision.created_at)}</span>
					</summary>
					<pre>{revision.body}</pre>
				</details>
			{/each}
		</div>
		{#if total > items.length}
			<p class="revisions-note">Showing {items.length} of {total} versions</p>
		{/if}
	{/if}
</div>

<style>
	.revisions {
		min-width: 0;
	}

	.revisions-empty {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.revision-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.revision {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--field);
		padding: var(--space-2) var(--space-3);
	}

	.revision summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.field {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.when {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.revision pre {
		margin: var(--space-2) 0 0;
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.revisions-note {
		margin: var(--space-2) 0 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
</style>
