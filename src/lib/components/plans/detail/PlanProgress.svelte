<script lang="ts">
	import Badge from "@ku6epxboctuk/ui-kit/components/Badge.svelte";
	import type { PlanProgress } from "#lib/tasks/progress/plan-progress.ts";

	interface Props {
		progress: PlanProgress;
	}

	let { progress }: Props = $props();

	const percent = $derived(
		progress.total === 0
			? 0
			: Math.round((progress.closed / progress.total) * 100),
	);
	const complete = $derived(
		progress.total > 0 && progress.closed === progress.total,
	);
</script>

<div class="progress-row">
	<Badge tone={complete ? "success" : "neutral"} variant="outline">
		{progress.closed}
		of {progress.total} tasks closed
	</Badge>
	{#if complete}
		<Badge tone="success">Completed</Badge>
	{/if}
	<div
		class="progress-track"
		role="progressbar"
		aria-label="Plan completion"
		aria-valuenow={percent}
		aria-valuemin="0"
		aria-valuemax="100"
	>
		<div class="progress-fill" style:width={`${percent}%`}></div>
	</div>
	<span class="progress-percent">{percent}%</span>
</div>

<style>
	.progress-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ui-space-2);
	}

	.progress-track {
		flex: 0 1 calc(var(--ui-space-4) * 20);
		min-width: calc(var(--ui-space-4) * 6);
		height: var(--ui-space-2);
		overflow: hidden;
		background: var(--ui-bg-muted);
	}

	.progress-fill {
		height: 100%;
		background: var(--ui-success);
	}

	.progress-percent {
		color: var(--ui-fg-secondary);
		font-size: var(--ui-fs-sm);
	}
</style>
