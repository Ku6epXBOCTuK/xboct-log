<script lang="ts">
	interface Props {
		offset: number;
		limit: number;
		total: number;
		emptyLabel: string;
		onchange: (offset: number) => void;
	}

	let { offset, limit, total, emptyLabel, onchange }: Props = $props();

	const canPrev = $derived(offset > 0);
	const canNext = $derived(offset + limit < total);
	const range = $derived(
		total === 0
			? emptyLabel
			: `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`,
	);
</script>

<footer class="pager">
	<span class="muted">{range}</span>
	<div class="pager-buttons">
		<button
			class="page-button"
			disabled={!canPrev}
			onclick={() => onchange(Math.max(0, offset - limit))}
		>
			Previous
		</button>
		<button
			class="page-button"
			disabled={!canNext}
			onclick={() => onchange(offset + limit)}
		>
			Next
		</button>
	</div>
</footer>

<style>
	.pager {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--edge-pad);
		border-top: 1px solid var(--border);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.pager-buttons {
		display: flex;
		gap: var(--space-2);
	}

	.page-button {
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		padding: 0 var(--space-3);
		min-height: var(--control-h-sm);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.page-button:hover:not(:disabled) {
		background: var(--hover);
		color: var(--foreground);
	}
</style>
