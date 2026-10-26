<script lang="ts">
	import { isTypingTarget, matchesHotkey } from "#lib/hotkeys/hotkeys.ts";
	import { createDebouncedValue } from "#lib/state/debounce.svelte.ts";
	import Search from "~icons/lucide/search";
	import X from "~icons/lucide/x";

	interface Props {
		value: string;
		oninput: (value: string) => void;
		onclear?: () => void;
	}

	let { value, oninput, onclear }: Props = $props();

	let input = $state<HTMLInputElement | undefined>();
	const search = createDebouncedValue("");
	let lastEmitted = "";
	let lastValue = "";

	$effect(() => {
		if (value === lastValue) return;
		lastValue = value;
		lastEmitted = value;
		search.apply(value);
	});

	$effect(() => {
		const next = search.applied;
		if (next === lastEmitted) return;
		lastEmitted = next;
		oninput(next);
	});

	$effect(() => () => search.cancel());

	function clear() {
		search.apply("");
		lastEmitted = "";
		onclear?.();
	}

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
		value={search.value}
		oninput={(event) => search.set(event.currentTarget.value)}
		placeholder="Search: text, ID, =29, =LOG-29"
		aria-label="Search tasks"
	/>
	{#if search.value !== "" && onclear}
		<button class="clear-button" onclick={clear} aria-label="Clear search">
			<X />
		</button>
	{:else}
		<kbd>/</kbd>
	{/if}
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

	.clear-button {
		position: absolute;
		right: var(--space-2);
		display: grid;
		place-items: center;
		width: var(--control-h-sm);
		height: var(--control-h-sm);
		border: 0;
		background: transparent;
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.clear-button:hover {
		color: var(--foreground);
		background: var(--hover);
	}

	.clear-button :global(svg) {
		position: static;
		width: 0.875rem;
		height: 0.875rem;
		color: inherit;
	}
</style>
