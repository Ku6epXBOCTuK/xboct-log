<script lang="ts">
	import { isTypingTarget, matchesHotkey } from "#lib/hotkeys/hotkeys.ts";
	import Search from "~icons/lucide/search";

	interface Props {
		value: string;
		oninput: (value: string) => void;
	}

	let { value, oninput }: Props = $props();

	let input = $state<HTMLInputElement | undefined>();

	function onkeydown(event: KeyboardEvent) {
		if (!matchesHotkey(event, "/")) return;
		if (isTypingTarget(event.target)) return;
		event.preventDefault();
		input?.focus();
		input?.select();
	}
</script>

<svelte:window {onkeydown} />

<div class="search-wrap">
	<Search />
	<input
		bind:this={input}
		{value}
		oninput={(event) => oninput(event.currentTarget.value)}
		placeholder="Search by title, description, and ID"
		aria-label="Search tasks"
	/>
	<kbd>/</kbd>
</div>

<style>
	.search-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-wrap > :global(svg) {
		position: absolute;
		left: var(--space-3);
		width: 1rem;
		color: var(--text-muted);
		pointer-events: none;
	}

	.search-wrap input {
		width: 100%;
		min-height: var(--control-h-lg);
		background: var(--field);
		color: var(--foreground);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		outline: none;
		padding: 0 2.75rem 0 2.375rem;
		font-size: var(--text-md);
	}

	.search-wrap input:focus {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	.search-wrap:focus-within > :global(svg) {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	.search-wrap kbd {
		position: absolute;
		right: var(--space-3);
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
		font-size: var(--text-xs);
		line-height: 1.35rem;
	}
</style>
