<script lang="ts">
	import type { PlanWithCounts } from "#lib/api/plans/plans.ts";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import PlanStatusDot from "../PlanStatusDot.svelte";

	interface Props {
		plan: PlanWithCounts;
		active: boolean;
		onselect: () => void;
	}

	let { plan, active, onselect }: Props = $props();
</script>

<li class="plan-row" class:active>
	<button class="plan-link" type="button" onclick={onselect}>
		<span class="plan-key">{plan.key}</span>
		<span class="plan-name">{plan.name}</span>
		<span class="plan-meta">
			<PlanStatusDot status={plan.status} />
			{plan.status}
			· {plan.tasks_count} tasks · {plan.epics_count} epics
		</span>
	</button>
	<div class="plan-copy">
		<CopyButton
			size="sm"
			text={plan.key}
			label="Copy plan id"
			title="Copy plan id"
		/>
	</div>
</li>

<style>
	.plan-row {
		--row-fg: var(--ui-fg-secondary);
		display: flex;
		align-items: flex-start;
		gap: var(--ui-space-2);
		padding: var(--ui-space-2);
		border-radius: var(--ui-r-control);
		color: var(--row-fg);
	}

	.plan-row:hover {
		--row-fg: var(--ui-fg);
		background: var(--ui-hover);
	}

	.plan-row.active {
		--row-fg: var(--ui-fg);
		background: var(--ui-selected);
	}

	.plan-link {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--ui-space-1);
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.plan-key {
		color: var(--row-fg);
		font-family: var(--ui-font-mono);
		font-size: var(--ui-fs-xs);
	}

	.plan-name {
		max-width: 100%;
		overflow: hidden;
		font-size: var(--ui-fs-md);
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.plan-meta {
		display: flex;
		align-items: center;
		gap: var(--ui-space-1);
		color: var(--row-fg);
		font-size: var(--ui-fs-xs);
		white-space: nowrap;
	}

	.plan-copy {
		flex: 0 0 auto;
		opacity: 0;
	}

	.plan-row:hover .plan-copy,
	.plan-row:focus-within .plan-copy {
		opacity: 1;
	}
</style>
