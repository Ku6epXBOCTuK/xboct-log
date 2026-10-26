<script lang="ts">
	import InfoPopover from "#lib/components/ui/InfoPopover.svelte";
	import type { EpicProgress } from "#lib/tasks/filter.ts";

	interface Props {
		id: string;
		progress: EpicProgress | null;
		onfilter?: (id: string) => void;
	}

	let { id, progress, onfilter }: Props = $props();

	const empty = $derived(progress === null || progress.total === 0);
	const fill = $derived(
		progress !== null && progress.total > 0
			? Math.round((progress.closed / progress.total) * 100)
			: 0,
	);
	const title = $derived(
		progress !== null && progress.total > 0
			? `${progress.closed}/${progress.total} closed; click to show these tasks`
			: "No tasks yet",
	);
</script>

<span class="epic-marker-wrap">
	<InfoPopover
		text={title}
		class={`epic-badge epic-marker${empty ? " epic-marker-empty" : ""}`}
		style={`--epic-fill: ${fill}%`}
		onclick={() => onfilter?.(id)}
	>
		EPIC
	</InfoPopover>
</span>

<style>
	.epic-marker-wrap {
		display: inline-flex;
		flex: none;
	}

	.epic-marker-wrap :global(.info-popover-trigger.epic-marker) {
		padding: var(--space-1) var(--space-2);
		margin-left: var(--space-2);
		background: linear-gradient(
			to right,
			color-mix(in oklch, var(--violet) 38%, transparent) var(--epic-fill, 0%),
			var(--violet-surface) var(--epic-fill, 0%)
		);
		color: var(--violet-ink);
		cursor: pointer;
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1.25;
	}

	.epic-marker-wrap :global(.info-popover-trigger.epic-marker:hover) {
		background: linear-gradient(
			to right,
			color-mix(in oklch, var(--violet) 52%, transparent) var(--epic-fill, 0%),
			color-mix(in oklch, var(--violet) 12%, transparent) var(--epic-fill, 0%)
		);
	}

	.epic-marker-wrap :global(.info-popover-trigger.epic-marker-empty) {
		border: 1px solid color-mix(in oklch, var(--violet) 45%, transparent);
		background: transparent;
		color: var(--violet-ink);
	}

	.epic-marker-wrap :global(.info-popover-trigger.epic-marker-empty:hover) {
		background: var(--violet-surface);
	}
</style>
