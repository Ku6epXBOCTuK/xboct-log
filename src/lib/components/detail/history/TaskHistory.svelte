<script lang="ts">
	import { fetchFresh } from "#lib/api/fresh.ts";
	import { getTaskHistory } from "#lib/api/tasks/activity.ts";
	import ActivityTable from "#lib/components/activity/ActivityTable.svelte";
	import { data } from "#lib/data/data.svelte.ts";
	import type { ActivityItem, Task } from "#lib/types.ts";

	interface Props {
		task: Task;
		limit?: number;
	}

	let { task, limit = 100 }: Props = $props();

	let items = $state<ActivityItem[]>([]);
	let total = $state(0);
	let failed = $state(false);

	$effect(() => {
		const key = `${task.id}:${task.updated_at}`;
		void load(task.id, key);
	});

	async function load(id: string, key: string) {
		try {
			await data.load(
				`history:${id}:${key}`,
				() => fetchFresh(getTaskHistory({ task_id: id, limit })),
				(result) => {
					items = result.items;
					total = result.total;
					failed = false;
				},
				true,
			);
		} catch {
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
			<p class="history-note">Showing {items.length} of {total} entries</p>
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
