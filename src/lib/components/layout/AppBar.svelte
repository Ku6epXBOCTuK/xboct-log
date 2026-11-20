<script lang="ts">
	import type { Snippet } from "svelte";
	import { reloadApp } from "#lib/reload.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton.svelte";
	import Moon from "~icons/lucide/moon";
	import RefreshCw from "~icons/lucide/refresh-cw";
	import Sun from "~icons/lucide/sun";
	import BackendBadge from "./BackendBadge.svelte";

	interface Props {
		leading?: Snippet;
	}

	let { leading }: Props = $props();

	const { theme } = useBoard();
</script>

<header class="app-bar">
	<div class="leading">
		{@render leading?.()}
	</div>
	<div class="actions">
		<BackendBadge />
		<IconButton
			label={theme.appearance === "light"
				? "Switch to dark theme"
				: "Switch to light theme"}
			size="md"
			onclick={theme.toggle}
		>
			{#if theme.appearance === "light"}
				<Moon />
			{:else}
				<Sun />
			{/if}
		</IconButton>
		<IconButton label="Reload" size="md" class="reload" onclick={reloadApp}>
			<RefreshCw />
		</IconButton>
	</div>
</header>

<style>
	.app-bar {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-2) var(--edge-pad);
		border-bottom: 1px solid var(--border);
		background: var(--background);
	}

	.leading {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3);
		min-width: 0;
	}

	.actions {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.actions :global(.ui-icon-button.reload) {
		color: var(--accent-ink);
	}

	.actions :global(.ui-icon-button.reload:hover:not(:disabled)) {
		color: var(--accent-ink);
		background: var(--danger-surface);
	}

	.app-bar :global(h1) {
		margin: 0;
		font-size: var(--text-2xl);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.app-bar :global(.muted) {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 560px) {
		.app-bar :global(h1) {
			font-size: var(--text-xl);
		}
	}
</style>
