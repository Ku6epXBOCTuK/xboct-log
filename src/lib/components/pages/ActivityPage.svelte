<script lang="ts">
	import { fetchFresh } from "#lib/api/fresh.ts";
	import type { ActivityOp } from "#lib/api/tasks/activity.ts";
	import { listActivityLog } from "#lib/api/tasks/activity.ts";
	import ActivityFilters from "#lib/components/activity/ActivityFilters.svelte";
	import ActivityTable from "#lib/components/activity/ActivityTable.svelte";
	import AppBar from "#lib/components/layout/AppBar.svelte";
	import Pager from "#lib/components/ui/Pager.svelte";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { createPagedQuery } from "#lib/state/ui/paged.svelte.ts";
	import type {
		ActivityEntity,
		ActivityLogItem,
		ActivitySource,
	} from "#lib/types.ts";
	import { ENTITIES } from "#lib/types.ts";

	const LIMIT = 50;

	const { projects, filters, setActiveProject, fresh } = useBoard();

	let source = $state("");
	let op = $state("");
	let entity = $state("");
	let from = $state("");
	let to = $state("");
	let ops = $state<string[]>([]);

	const paged = createPagedQuery<ActivityLogItem>(
		"activity",
		async (offset) => {
			const result = await fetchFresh(
				listActivityLog({
					source: source === "" ? undefined : (source as ActivitySource),
					op: op === "" ? undefined : (op as ActivityOp),
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
		},
		LIMIT,
	);

	$effect(() => {
		void paged.load(0);
	});

	$effect(() => {
		const offs = ENTITIES.map((entity) =>
			fresh.register(entity, () => paged.load(paged.cursor)),
		);
		return () => {
			for (const off of offs) {
				off();
			}
		};
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
	<AppBar>
		{#snippet leading()}
			<h1>Activity</h1>
			<span class="muted">{paged.total} entries</span>
		{/snippet}
	</AppBar>

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
		size={paged.size}
		pageSize={paged.pageSize}
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
