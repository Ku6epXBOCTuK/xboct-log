<script lang="ts">
	import ActivityTable from "#lib/components/activity/ActivityTable.svelte";
	import { getTaskHistory } from "#lib/remote/activity.remote.ts";
	import { fetchFresh } from "#lib/remote/fresh.ts";
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
			const result = await fetchFresh(getTaskHistory({ task_id: id, limit }));
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
			<ActivityTable {items} />
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

	.history-note {
		margin: var(--space-2) 0 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
</style>
