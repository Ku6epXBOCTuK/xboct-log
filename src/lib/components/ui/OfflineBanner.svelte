<script lang="ts">
	import { useBoard } from "#lib/state/board.svelte.ts";

	const { health } = useBoard();

	const lastSeen = $derived(
		health.lastOkAt === null
			? ""
			: `last answer ${new Date(health.lastOkAt).toLocaleTimeString()}`,
	);
</script>

{#if health.state === "offline"}
	<div class="offline-banner" role="alert">
		<span class="headline">Backend unreachable. Changes are not saved.</span>
		{#if lastSeen !== ""}
			<span class="seen">{lastSeen}</span>
		{/if}
		<button type="button" onclick={() => void health.check()}>Retry now</button>
	</div>
{/if}

<style>
	.offline-banner {
		position: fixed;
		top: var(--space-3);
		left: 50%;
		translate: -50% 0;
		z-index: 30;
		max-width: calc(100vw - var(--space-6));
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--accent);
		border-radius: var(--radius-lg);
		background: var(--danger-surface);
		color: var(--accent-ink);
		font-size: var(--text-sm);
		font-weight: 500;
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.35);
		animation: drop 0.18s ease-out;
	}

	.headline {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.seen {
		flex: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.offline-banner button {
		flex: none;
		min-height: var(--control-h-sm);
		padding: 0 var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--on-accent);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}

	.offline-banner button:hover {
		background: color-mix(in oklch, var(--accent) 88%, var(--on-accent));
	}

	@keyframes drop {
		from {
			opacity: 0;
			translate: -50% -0.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.offline-banner {
			animation: none;
		}
	}
</style>
