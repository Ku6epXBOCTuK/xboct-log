<script lang="ts">
	import type { PlanWithCounts } from "#lib/api/plans.ts";
	import type { PlanStatusFilter } from "#lib/state/plans.svelte.ts";
	import Segmented from "@ku6epxboctuk/ui-kit/components/Segmented.svelte";
	import PlanRow from "./PlanRow.svelte";

	interface Props {
		plans: PlanWithCounts[];
		activeId: string | null;
		filter: PlanStatusFilter;
		onselect: (id: string) => void;
		onfilter: (filter: PlanStatusFilter) => void;
	}

	let { plans, activeId, filter, onselect, onfilter }: Props = $props();

	const options = [
		{ value: "all", label: "All" },
		{ value: "active", label: "Active" },
		{ value: "closed", label: "Closed" },
	];
</script>

<div class="plan-column">
	<div class="plan-toolbar">
		<span class="filter-label">Status</span>
		<Segmented
			{options}
			value={filter}
			label="Status filter"
			onchange={(value) => onfilter(value as PlanStatusFilter)}
		/>
	</div>
	<ul class="plan-list">
		{#each plans as plan (plan.id)}
			<PlanRow
				{plan}
				active={plan.id === activeId}
				onselect={() => onselect(plan.id)}
			/>
		{/each}
	</ul>
</div>

<style>
	.plan-column {
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding: var(--ui-space-3);
		border-right: 1px solid var(--ui-line);
	}

	.plan-toolbar {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--ui-space-2);
		margin-bottom: var(--ui-space-3);
		padding-bottom: var(--ui-space-3);
		border-bottom: 1px solid var(--ui-line);
	}

	.filter-label {
		color: var(--ui-fg-secondary);
		font-family: var(--ui-font-mono);
		font-size: var(--ui-fs-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.plan-list {
		min-height: 0;
		overflow: auto;
		margin: 0;
		padding: 0 0 var(--ui-space-6);
		list-style: none;
	}
</style>
