<script lang="ts">
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton.svelte";
	import { NAV_ITEMS } from "#lib/navigation/items.ts";
	import { parsePath } from "#lib/navigation/paths.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { page } from "$app/state";
	import Pin from "~icons/lucide/pin";
	import PinOff from "~icons/lucide/pin-off";

	interface Props {
		taskCount: number;
		inProgressCount: number;
		collapsed?: boolean;
	}

	let { taskCount, inProgressCount, collapsed = false }: Props = $props();

	const { ui } = useBoard();

	const project = $derived(parsePath(page.url.pathname).project);
</script>

<nav class="primary-nav" class:collapsed aria-label="Primary navigation">
	{#each NAV_ITEMS as item (item.id)}
		{@const active = item.active(page.url.pathname)}
		{@const pinned = ui.isPinned(item.id)}
		<div
			class="nav-row"
			class:pinned
			class:active
			class:no-count={!item.badge}
			data-testid={`nav-row-${item.id}`}
		>
			<a
				class="nav-item"
				class:active
				href={item.href(project)}
				data-testid={`nav-item-${item.id}`}
			>
				<item.icon />
				<span class="nav-label">{item.label}</span>
				{#if item.badge === "tasks"}
					<span class="nav-count">{taskCount}</span>
				{:else if item.badge === "kanban"}
					<span class="nav-count">{inProgressCount}</span>
				{/if}
			</a>
			<IconButton
				class="pin-toggle"
				label={`${pinned ? "Unpin" : "Pin"} ${item.label}`}
				active={pinned}
				data-testid={`nav-pin-${item.id}`}
				onclick={() => ui.togglePin(item.id)}
			>
				{#if pinned}
					<PinOff />
				{:else}
					<Pin />
				{/if}
			</IconButton>
		</div>
	{/each}
</nav>

<style>
	.primary-nav {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.nav-row {
		--nav-count-w: 1.75rem;
		--nav-pin-w: 2.25rem;
		position: relative;
		display: flex;
		align-items: center;
		min-width: 0;
	}

	.nav-row.no-count {
		--nav-count-w: 0rem;
	}

	.nav-item {
		flex: 1 1 auto;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--text-secondary);
		text-align: left;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius);
		font-size: var(--text-md);
		font-weight: 500;
		text-decoration: none;
	}

	.nav-item:hover {
		background: var(--hover);
		color: var(--foreground);
	}

	.nav-item :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: none;
	}

	.nav-item.active {
		color: var(--foreground);
		background: var(--selected);
	}

	.primary-nav.collapsed .nav-row:not(.pinned):not(.active) {
		display: none;
	}

	.nav-row :global(.pin-toggle) {
		position: absolute;
		top: 50%;
		right: calc(var(--nav-count-w) + var(--space-3));
		transform: translateY(-50%);
		opacity: 0;
		transition: opacity 0.12s ease-out;
	}

	.nav-row:hover :global(.pin-toggle),
	.nav-row:focus-within :global(.pin-toggle) {
		opacity: 1;
	}

	.nav-row :global(.pin-toggle[data-active]) {
		border-color: transparent;
		background: transparent;
	}

	.nav-row:hover :global(.pin-toggle[data-active]),
	.nav-row:focus-within :global(.pin-toggle[data-active]) {
		background: var(--hover);
	}

	@media (hover: none) {
		.nav-row :global(.pin-toggle) {
			opacity: 1;
		}
	}

	.nav-label {
		padding-right: calc(var(--nav-pin-w) + var(--space-2));
	}

	.nav-count {
		margin-left: auto;
		min-width: var(--nav-count-w);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.nav-item:hover .nav-count,
	.nav-item.active .nav-count {
		color: var(--foreground);
	}
</style>
