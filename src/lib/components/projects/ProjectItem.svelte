<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		active: boolean;
		count: number;
		onselect: () => void;
		children: Snippet;
	}

	let { active, count, onselect, children }: Props = $props();
</script>

<button
	class={`project-item ${active ? "selected" : ""}`}
	aria-pressed={active}
	onclick={onselect}
>
	<span class="project-mark"></span>
	<span class="project-name">
		{@render children()}
	</span>
	<span class="project-count">{count}</span>
</button>

<style>
	.project-item {
		border: 0;
		background: transparent;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1 1 auto;
		min-width: 0;
		width: 100%;
		padding: var(--space-2);
		text-align: left;
		font-size: var(--text-sm);
		border-radius: var(--radius-sm);
	}

	.project-item:hover,
	.project-item.selected {
		color: var(--foreground);
	}

	.project-item:hover {
		background: var(--hover);
	}

	.project-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.project-mark {
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 50%;
		border: 1px solid var(--border-strong);
		flex: none;
		display: grid;
		place-items: center;
	}

	.project-item:hover .project-mark {
		border-color: var(--text-muted);
	}

	.project-item.selected .project-mark {
		border-color: var(--accent);
	}

	.project-item.selected .project-mark::after {
		content: "";
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--accent);
	}

	.project-count {
		margin-left: auto;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}
</style>
