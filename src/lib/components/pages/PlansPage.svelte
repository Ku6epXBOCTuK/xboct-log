<script lang="ts">
	import AppBar from "#lib/components/layout/AppBar.svelte";
	import PlanCreateForm from "#lib/components/plans/PlanCreateForm.svelte";
	import PlanDetail from "#lib/components/plans/PlanDetail.svelte";
	import PlanList from "#lib/components/plans/PlanList.svelte";
	import PlanOpenForm from "#lib/components/plans/PlanOpenForm.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { createPlanStore } from "#lib/state/plans.svelte.ts";

	const { fresh } = useBoard();
	const store = createPlanStore();

	$effect(() => {
		void store.reloadPlans();
	});

	$effect(() => {
		const offPlans = fresh.register("plans", () => void store.reloadPlans());
		const reloadDetail = () => {
			const id = store.activeId;
			if (id !== null) return store.loadDetail(id);
		};
		const offTasks = fresh.register("tasks", reloadDetail);
		const offDocuments = fresh.register("documents", reloadDetail);
		return () => {
			offPlans();
			offTasks();
			offDocuments();
		};
	});

	$effect(() => {
		const id = store.activeId;
		if (id === null) {
			store.clearDetail();
			return;
		}
		void store.loadDetail(id);
	});
</script>

<section class="plans-page">
	<AppBar>
		{#snippet leading()}
			<h1>Plans</h1>
			<PlanCreateForm
				count={store.plans.length}
				creating={store.creating}
				failed={store.createFailed}
				oncreate={(name) => store.create(name)}
			/>
			<PlanOpenForm failed={store.openFailed} onopen={(id) => store.open(id)} />
		{/snippet}
	</AppBar>

	{#if store.failed}
		<div class="error-wrap">
			<ErrorNote message="Plans are unavailable" />
		</div>
	{/if}

	{#if !store.loaded}
		<p class="empty">Loading…</p>
	{:else}
		<div class="columns">
			<PlanList
				plans={store.plans}
				activeId={store.activeId}
				filter={store.statusFilter}
				query={store.query}
				onselect={(id) => store.select(id)}
				onfilter={(filter) => void store.setStatusFilter(filter)}
				onquery={(query) => void store.setQuery(query)}
			/>
			<div class="detail">
				<PlanDetail {store} />
			</div>
		</div>
	{/if}
</section>

<style>
	.plans-page {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--ui-panel);
	}

	.error-wrap {
		margin: 0 var(--ui-space-4) var(--ui-space-3);
	}

	.empty {
		margin: 0;
		padding: var(--ui-space-8) var(--ui-space-4);
		color: var(--ui-fg-secondary);
		font-size: var(--ui-fs-sm);
	}

	.columns {
		flex: 1 1 auto;
		min-height: 0;
		display: grid;
		grid-template-columns: calc(var(--ui-space-4) * 20) minmax(0, 1fr);
	}

	.detail {
		min-width: 0;
		overflow: auto;
		padding: var(--ui-space-4) var(--ui-space-5);
	}
</style>
