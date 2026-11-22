<script lang="ts">
	import type { PlanWithCounts } from "#lib/api/plans.ts";
	import PlanRow from "./PlanRow.svelte";

	interface Props {
		plans: PlanWithCounts[];
		activeId: string | null;
		onselect: (id: string) => void;
	}

	let { plans, activeId, onselect }: Props = $props();
</script>

<ul class="plan-list">
	{#each plans as plan (plan.id)}
		<PlanRow
			{plan}
			active={plan.id === activeId}
			onselect={() => onselect(plan.id)}
		/>
	{/each}
</ul>

<style>
	.plan-list {
		min-height: 0;
		overflow: auto;
		margin: 0;
		padding: 0 var(--ui-space-2) var(--ui-space-6) var(--ui-space-4);
		list-style: none;
		border-right: var(--ui-line-w) solid var(--ui-line);
	}
</style>
