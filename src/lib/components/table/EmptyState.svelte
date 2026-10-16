<script lang="ts">
	import SlidersHorizontal from "~icons/lucide/sliders-horizontal";

	interface Props {
		total: number;
		onclear?: () => void;
		onnew?: () => void;
	}

	let { total, onclear, onnew }: Props = $props();
</script>

<div class="empty-state">
	<SlidersHorizontal />
	<p>{total === 0 ? "No tasks yet." : "No tasks match these filters."}</p>
	<div class="empty-actions">
		{#if total > 0}
			<button onclick={onclear}>Reset filters</button>
		{/if}
		<button onclick={onnew}>New task</button>
	</div>
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-12) var(--space-6);
		color: var(--text-muted);
		text-align: center;
	}

	.empty-state :global(svg) {
		width: 1.5rem;
		height: 1.5rem;
	}

	.empty-state button {
		background: transparent;
		border: 1px solid var(--border-strong);
		color: var(--text-secondary);
		padding: 0 var(--space-3);
		min-height: var(--control-h);
		border-radius: var(--radius);
		font-size: var(--text-sm);
	}

	.empty-state button:hover {
		background: var(--hover);
		color: var(--foreground);
	}

	.empty-actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
