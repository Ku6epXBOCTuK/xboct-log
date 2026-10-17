<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		label: string;
		children: Snippet;
		onclick?: (event: MouseEvent) => void;
		type?: "button" | "submit";
		disabled?: boolean;
		expanded?: boolean;
		title?: string;
		size?: "sm" | "md";
		class?: string;
	}

	let {
		label,
		children,
		onclick,
		type = "button",
		disabled = false,
		expanded,
		title,
		size = "sm",
		class: className = "",
	}: Props = $props();
</script>

<button
	{type}
	{disabled}
	{title}
	class={`icon-btn icon-btn-${size} ${className}`.trim()}
	aria-label={label}
	aria-expanded={expanded}
	{onclick}
>
	{@render children()}
</button>

<style>
	.icon-btn {
		appearance: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		line-height: 1;
		display: inline-grid;
		place-items: center;
		border-radius: var(--radius-sm);
		flex: none;
		user-select: none;
	}

	.icon-btn :global(svg) {
		flex: none;
	}

	.icon-btn-sm {
		width: var(--control-h-sm);
		height: var(--control-h-sm);
	}

	.icon-btn-sm :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.icon-btn-md {
		width: var(--control-h);
		height: var(--control-h);
	}

	.icon-btn-md :global(svg) {
		width: 1.25rem;
		height: 1.25rem;
	}

	.icon-btn:hover:not(:disabled) {
		color: var(--foreground);
		background: color-mix(in oklch, var(--foreground) 12%, transparent);
	}

	.icon-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
