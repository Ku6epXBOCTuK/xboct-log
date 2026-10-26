<script lang="ts">
	import { pageCount, pageItems } from "#lib/tasks/paging.ts";
	import ChevronLeft from "~icons/lucide/chevron-left";
	import ChevronRight from "~icons/lucide/chevron-right";

	interface Props {
		offset: number;
		limit: number;
		total: number;
		emptyLabel: string;
		onchange: (offset: number) => void;
	}

	let { offset, limit, total, emptyLabel, onchange }: Props = $props();

	const pages = $derived(pageCount(total, limit));
	const page = $derived(Math.min(pages, Math.floor(offset / limit) + 1));
	const range = $derived(
		total === 0
			? emptyLabel
			: `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`,
	);
</script>

<footer class="pager">
	<span class="muted">{range}</span>
	<nav class="pages" aria-label="Pagination">
		<button
			class="arrow"
			disabled={page <= 1}
			onclick={() => onchange((page - 2) * limit)}
			aria-label="Previous page"
		>
			<ChevronLeft />
		</button>
		<span class="compact">{page} / {pages}</span>
		<div class="numbers">
			{#each pageItems(page, pages) as item, index (index)}
				{#if item === "gap"}
					<span class="gap">…</span>
				{:else}
					<button
						class="number"
						class:current={item === page}
						aria-current={item === page ? "page" : undefined}
						onclick={() => onchange((item - 1) * limit)}
					>
						{item}
					</button>
				{/if}
			{/each}
		</div>
		<button
			class="arrow"
			disabled={page >= pages}
			onclick={() => onchange(page * limit)}
			aria-label="Next page"
		>
			<ChevronRight />
		</button>
	</nav>
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

	.pages {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		font-variant-numeric: tabular-nums;
	}

	.pages button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.arrow {
		width: 1.75rem;
		height: 1.75rem;
	}

	.arrow :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.numbers {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.number {
		min-width: 1.75rem;
		height: 1.75rem;
		padding: 0 var(--space-1);
	}

	.arrow:hover:not(:disabled),
	.number:hover {
		background: var(--hover);
		color: var(--foreground);
	}

	.pages button:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.number.current {
		background: var(--hover);
		color: var(--foreground);
		font-weight: 600;
	}

	.gap {
		padding: 0 var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.compact {
		display: none;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	@media (max-width: 560px) {
		.muted,
		.numbers {
			display: none;
		}

		.compact {
			display: inline;
		}
	}
</style>
