<script lang="ts">
	import ActivityFilters from "#lib/components/activity/ActivityFilters.svelte";
	import ActivityTable from "#lib/components/activity/ActivityTable.svelte";
	import Pager from "#lib/components/ui/Pager.svelte";
	import { listActivityLog } from "#lib/remote/activity.remote.ts";
	import { fetchFresh } from "#lib/remote/fresh.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { createPagedQuery } from "#lib/state/paged.svelte.ts";
	import type {
		ActivityEntity,
		ActivityLogItem,
		ActivitySource,
	} from "#lib/types.ts";

	const LIMIT = 50;

	const { projects, filters, setActiveProject } = useBoard();

	let source = $state("");
	let op = $state("");
	let entity = $state("");
	let from = $state("");
	let to = $state("");
	let ops = $state<string[]>([]);

	const paged = createPagedQuery<ActivityLogItem>(async (offset) => {
		const result = await fetchFresh(
			listActivityLog({
				source: source === "" ? undefined : (source as ActivitySource),
				op: op === "" ? undefined : op,
				entity: entity === "" ? undefined : (entity as ActivityEntity),
				project_id: filters.activeProject ?? undefined,
				from: from === "" ? undefined : `${from}T00:00:00.000Z`,
				to: to === "" ? undefined : `${to}T23:59:59.999Z`,
				limit: LIMIT,
				offset,
			}),
		);
		ops = result.ops;
		return result;
	});

	$effect(() => {
		void paged.load(0);
	});

	const hasFilters = $derived(
		filters.activeProject !== null ||
			source !== "" ||
			op !== "" ||
			entity !== "" ||
			from !== "" ||
			to !== "",
	);
</script>

<section class="activity-page">
	<header class="page-head">
		<h1>Activity</h1>
		<span class="muted">{paged.total} entries</span>
	</header>

	<ActivityFilters
		projects={projects.all}
		activeProject={filters.activeProject}
		{ops}
		bind:source
		bind:op
		bind:entity
		bind:from
		bind:to
		onproject={setActiveProject}
	/>

	{#if paged.failed}
		<p class="empty">Activity log is unavailable</p>
	{:else if !paged.loaded}
		<p class="empty">Loading…</p>
	{:else if paged.items.length === 0}
		<p class="empty">
			{hasFilters ? "No entries match the filters" : "No activity recorded yet"}
		</p>
	{:else}
		<div class="table-wrap">
			<ActivityTable items={paged.items} showEntity />
		</div>
	{/if}

	<Pager
		offset={paged.offset}
		limit={LIMIT}
		total={paged.total}
		emptyLabel="0 entries"
		onchange={(next) => void paged.load(next)}
	/>
</section>

<style>
	.activity-page {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--background);
	}

	.page-head {
		flex: none;
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--edge-pad) var(--edge-pad) var(--space-3);
	}

	.page-head h1 {
		margin: 0;
		font-size: var(--text-2xl);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.table-wrap {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		padding: 0 var(--edge-pad);
	}

	.empty {
		margin: 0;
		padding: var(--space-8) var(--edge-pad);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
