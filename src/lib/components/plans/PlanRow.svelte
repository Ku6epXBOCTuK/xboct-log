<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import type { PlanWithCounts } from "#lib/api/plans.ts";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";

	interface Props {
		plan: PlanWithCounts;
		active: boolean;
		onselect: () => void;
	}

	let { plan, active, onselect }: Props = $props();
</script>

<li class="plan-row" class:active>
	<Button class="plan-link" variant="ghost" type="button" onclick={onselect}>
		<span class="plan-key">{plan.key}</span>
		<span class="plan-name">{plan.name}</span>
		<span class="plan-meta">
			{plan.status}
			· {plan.closed_tasks_count}/{plan.tasks_count}
			closed · {plan.epics_count} epics
		</span>
	</Button>
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
		display: flex;
		align-items: flex-start;
		gap: var(--ui-space-1);
		border-radius: var(--ui-r-control);
		color: var(--ui-fg-secondary);
	}

	.plan-row:hover {
		background: var(--ui-hover);
	}

	.plan-row.active {
		background: var(--ui-selected);
		color: var(--ui-fg);
	}

	.plan-row :global(.plan-link) {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--ui-space-1);
		padding: var(--ui-space-2) var(--ui-space-3);
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
	}

	.plan-key {
		color: var(--ui-fg-muted);
	}

	.plan-name {
		font-weight: 600;
	}

	.plan-meta {
		color: var(--ui-fg-muted);
		font-size: var(--ui-fs-sm);
	}

	.plan-copy {
		margin-top: var(--ui-space-2);
		margin-right: var(--ui-space-2);
	}
</style>
