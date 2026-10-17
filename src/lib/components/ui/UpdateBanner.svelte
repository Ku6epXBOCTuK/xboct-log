<script lang="ts">
	import { updated } from "$app/state";
	import X from "~icons/lucide/x";

	let dismissed = $state(false);
	const available = $derived(updated.current && !dismissed);
</script>

{#if available}
	<div class="update-banner">
		<span role="status">New version available</span>
		<button class="reload" onclick={() => location.reload()}> Reload </button>
		<button
			class="dismiss"
			aria-label="Dismiss"
			onclick={() => (dismissed = true)}
		>
			<X />
		</button>
	</div>
{/if}

<style>
	.update-banner {
		position: fixed;
		top: var(--space-3);
		left: 50%;
		translate: -50% 0;
		z-index: 20;
		max-width: calc(100vw - var(--space-6));
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--panel-strong);
		color: var(--foreground);
		font-size: var(--text-sm);
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.35);
		animation: drop 0.18s ease-out;
	}

	.update-banner span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.update-banner button {
		flex: none;
		min-height: var(--control-h-sm);
		padding: 0 var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}

	.reload {
		background: var(--accent);
		color: var(--on-accent);
	}

	.reload:hover {
		background: color-mix(in oklch, var(--accent) 88%, var(--on-accent));
	}

	.dismiss {
		display: grid;
		place-items: center;
		width: var(--control-h-sm);
		padding: 0;
		background: transparent;
		color: var(--text-muted);
	}

	.dismiss :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.dismiss:hover {
		color: var(--foreground);
		background: var(--hover);
	}

	@keyframes drop {
		from {
			opacity: 0;
			translate: -50% -0.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.update-banner {
			animation: none;
		}
	}
</style>
