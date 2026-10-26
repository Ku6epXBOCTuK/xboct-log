<script lang="ts">
	import type { Snippet } from "svelte";

	interface TriggerState {
		open: boolean;
		toggle: () => void;
	}

	interface Props {
		text?: string;
		content?: Snippet;
		icon?: Snippet;
		children?: Snippet;
		trigger?: Snippet<[TriggerState]>;
		label?: string;
		class?: string;
		style?: string;
		onclick?: (event: MouseEvent) => void;
		hover?: boolean;
	}

	let {
		text = "",
		content,
		icon,
		children,
		trigger,
		label,
		class: className = "",
		style = "",
		onclick,
		hover = true,
	}: Props = $props();

	let open = $state(false);
	let pinned = $state(false);
	let root = $state<HTMLSpanElement | null>(null);
	let panel = $state<HTMLDivElement | null>(null);

	function close() {
		open = false;
		pinned = false;
	}

	function toggle() {
		if (!open) {
			open = true;
			pinned = true;
			return;
		}
		if (pinned) {
			close();
			return;
		}
		pinned = true;
	}

	function place() {
		if (panel === null || root === null) return;

		const anchor = root.getBoundingClientRect();
		const margin = 8;
		const gap = 6;

		const width = panel.offsetWidth;
		const height = panel.offsetHeight;
		const spaceBelow = window.innerHeight - anchor.bottom - margin;
		const spaceAbove = anchor.top - margin;
		const flip = spaceBelow < height && spaceAbove > spaceBelow;

		const top = flip
			? Math.max(margin, anchor.top - height - gap)
			: Math.min(
					anchor.bottom + gap,
					Math.max(margin, window.innerHeight - height - margin),
				);
		const left = Math.min(
			Math.max(margin, anchor.left),
			Math.max(margin, window.innerWidth - width - margin),
		);

		panel.style.top = `${top}px`;
		panel.style.left = `${left}px`;
	}

	function handleClick(event: MouseEvent) {
		event.stopPropagation();
		if (onclick !== undefined) {
			onclick(event);
			return;
		}
		toggle();
	}

	function handlePointerEnter(event: PointerEvent) {
		if (!hover || event.pointerType !== "mouse") return;
		open = true;
	}

	function handlePointerLeave() {
		if (!hover || pinned) return;
		open = false;
	}

	function handleFocusOut(event: FocusEvent) {
		if (root !== null && root.contains(event.relatedTarget as Node)) return;
		close();
	}

	$effect(() => {
		if (!open || panel === null) return;

		if (!panel.matches(":popover-open")) panel.showPopover();
		place();

		const reposition = () => place();
		window.addEventListener("resize", reposition);
		window.addEventListener("scroll", reposition, true);
		const observer = new ResizeObserver(reposition);
		observer.observe(panel);

		return () => {
			window.removeEventListener("resize", reposition);
			window.removeEventListener("scroll", reposition, true);
			observer.disconnect();
			if (panel?.matches(":popover-open")) panel.hidePopover();
		};
	});

	$effect(() => {
		if (!open) return;

		function onPointerDown(event: PointerEvent) {
			if (root !== null && !root.contains(event.target as Node)) close();
		}

		function onKeydown(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			close();
			event.stopPropagation();
		}

		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeydown);

		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeydown);
		};
	});
</script>

<span
	class="info-popover"
	role="presentation"
	bind:this={root}
	onpointerenter={handlePointerEnter}
	onpointerleave={handlePointerLeave}
	onfocusout={handleFocusOut}
>
	{#if trigger}
		{@render trigger({ open, toggle })}
	{:else}
		<button
			type="button"
			class={`info-popover-trigger ${className}`.trim()}
			{style}
			aria-label={label ?? text}
			aria-expanded={open}
			onclick={handleClick}
		>
			{#if icon}
				{@render icon()}
			{/if}
			{#if children}
				{@render children()}
			{/if}
		</button>
	{/if}
	{#if open}
		<div
			class="info-popover-panel"
			popover="manual"
			role="note"
			bind:this={panel}
		>
			{#if content}
				{@render content()}
			{:else}
				{text}
			{/if}
		</div>
	{/if}
</span>

<style>
	.info-popover {
		display: inline-flex;
		flex: none;
	}

	.info-popover-trigger {
		appearance: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		font-weight: 400;
		letter-spacing: normal;
		line-height: 1;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		border-radius: var(--radius-sm);
		cursor: help;
		flex: none;
		user-select: none;
	}

	.info-popover-trigger :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
		flex: none;
	}

	.info-popover-panel {
		position: fixed;
		inset: auto;
		margin: 0;
		width: max-content;
		max-width: min(24rem, calc(100vw - 2rem));
		padding: var(--space-2) var(--space-3);
		background: var(--field);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		box-shadow: 0 0.75rem 1.75rem rgb(0 0 0 / 0.18);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-weight: 400;
		line-height: 1.45;
		white-space: normal;
		overflow-wrap: anywhere;
	}
</style>
