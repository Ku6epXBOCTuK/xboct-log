<script lang="ts">
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

	function filter(event: MouseEvent) {
		event.stopPropagation();
		onfilter?.(id);
	}
</script>

<button
	class={`epic-badge epic-marker${empty ? " epic-marker-empty" : ""}`}
	style={`--epic-fill: ${fill}%`}
	{title}
	onclick={filter}
>
	EPIC
</button>

<style>
	.epic-marker {
		border: 0;
		background: linear-gradient(
			to right,
			color-mix(in oklch, var(--violet) 38%, transparent) var(--epic-fill, 0%),
			var(--violet-surface) var(--epic-fill, 0%)
		);
		color: var(--violet-ink);
		cursor: pointer;
		font-family: var(--font-mono);
		font-weight: 600;
		letter-spacing: 0.04em;
		flex: none;
	}

	.epic-marker:hover {
		background: linear-gradient(
			to right,
			color-mix(in oklch, var(--violet) 52%, transparent) var(--epic-fill, 0%),
			color-mix(in oklch, var(--violet) 12%, transparent) var(--epic-fill, 0%)
		);
	}

	.epic-marker-empty {
		border: 1px solid color-mix(in oklch, var(--violet) 45%, transparent);
		background: transparent;
		color: var(--violet-ink);
	}

	.epic-marker-empty:hover {
		background: var(--violet-surface);
	}
</style>
