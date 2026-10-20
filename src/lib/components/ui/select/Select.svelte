<script lang="ts" generics="T">
	import type { Select } from "#lib/components/ui/select/select.svelte.ts";
	import type { Snippet } from "svelte";

	interface Props {
		select: Select<T>;
		getKey: (item: T) => string | number;
		trigger: Snippet;
		option: Snippet<[T]>;
		footer?: Snippet;
		isSelected?: (item: T) => boolean;
		onkeydown?: (event: KeyboardEvent) => boolean;
		searchable?: boolean;
		searchPlaceholder?: string;
		emptyLabel?: string;
		listLabel?: string;
		multiselect?: boolean;
		variant?: "filter" | "field";
		class?: string;
	}

	let {
		select,
		getKey,
		trigger,
		option,
		footer,
		isSelected = () => false,
		onkeydown,
		searchable = false,
		searchPlaceholder = "Search",
		emptyLabel = "Nothing found",
		listLabel = "Options",
		multiselect = false,
		variant = "filter",
		class: className = "",
	}: Props = $props();

	let root = $state<HTMLElement | null>(null);
	let popover = $state<HTMLDivElement | null>(null);
	let searchInput = $state<HTMLInputElement | null>(null);

	function place() {
		if (popover === null || root === null) return;

		const anchor = root.getBoundingClientRect();
		const margin = 8;
		const gap = 4;

		popover.style.minWidth = `${root.offsetWidth}px`;

		const width = popover.offsetWidth;
		const height = popover.offsetHeight;
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

		popover.style.top = `${top}px`;
		popover.style.left = `${left}px`;
	}

	function handleKeydown(event: KeyboardEvent) {
		const handled = onkeydown?.(event) || select.handleKeydown(event);
		if (handled) event.preventDefault();
	}

	$effect(() => {
		if (popover === null) return;

		if (!select.open) {
			if (popover.matches(":popover-open")) popover.hidePopover();
			return;
		}

		if (!popover.matches(":popover-open")) popover.showPopover();
		place();
		searchInput?.focus();

		window.addEventListener("resize", place);
		window.addEventListener("scroll", place, true);
		const observer = new ResizeObserver(() => place());
		observer.observe(popover);

		return () => {
			window.removeEventListener("resize", place);
			window.removeEventListener("scroll", place, true);
			observer.disconnect();
		};
	});

	$effect(() => {
		if (popover === null || !select.open) return;

		const active = select.active;
		if (active === null) return;

		const element = popover.querySelector('[data-active="true"]');
		element?.scrollIntoView({ block: "nearest" });
	});

	$effect(() => {
		if (!select.open) return;

		function onPointerDown(event: PointerEvent) {
			if (root !== null && !root.contains(event.target as Node)) select.hide();
		}

		function onKeydown(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			select.hide();
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

<div
	class={`select ${className}`.trim()}
	data-variant={variant}
	role="presentation"
	bind:this={root}
	onkeydown={handleKeydown}
>
	{@render trigger()}
	<div class="select-popover" popover="manual" bind:this={popover}>
		{#if select.open}
			{#if searchable}
				<input
					class="select-search"
					bind:this={searchInput}
					value={select.query}
					oninput={(event) => select.setQuery(event.currentTarget.value)}
					placeholder={searchPlaceholder}
					aria-label={searchPlaceholder}
					autocomplete="off"
				/>
			{/if}
			<div
				class="select-list"
				role="listbox"
				aria-label={listLabel}
				aria-multiselectable={multiselect}
			>
				{#if select.filtered.length === 0}
					<p class="select-empty">{emptyLabel}</p>
				{:else}
					{#each select.filtered as item, index (getKey(item))}
						<button
							type="button"
							role="option"
							class="select-option"
							data-active={select.active === item}
							aria-selected={isSelected(item)}
							onclick={() => select.pick(item)}
							onpointermove={() => select.moveTo(index)}
						>
							{@render option(item)}
						</button>
					{/each}
				{/if}
			</div>
			{#if footer}
				<div class="select-footer">
					{@render footer()}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.select {
		position: relative;
		display: inline-flex;
		min-width: 0;
	}

	.select[data-variant="field"] {
		display: block;
		width: 100%;
	}

	:global(.select-trigger) {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: var(--control-h);
		padding: 0 var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-secondary);
		font-family: inherit;
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
	}

	:global(.select-trigger:hover:not(:disabled)) {
		color: var(--foreground);
		background: var(--hover);
	}

	:global(.select-trigger:focus-visible),
	:global(.select-trigger[aria-expanded="true"]) {
		color: var(--foreground);
		border-color: var(--accent);
		outline: none;
	}

	:global(.select-trigger:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}

	:global(.select-trigger > svg) {
		width: 1rem;
		height: 1rem;
		flex: none;
		color: var(--text-muted);
	}

	:global(.select-trigger-label) {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.select-trigger-caret) {
		margin-left: auto;
	}

	.select[data-variant="field"] :global(.select-trigger) {
		padding: var(--space-2) var(--space-3);
		background: var(--field);
		color: var(--foreground);
		font-size: var(--text-md);
	}

	.select-popover {
		position: fixed;
		inset: auto;
		margin: 0;
		flex-direction: column;
		min-width: 13rem;
		padding: var(--space-1);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--panel);
		color: var(--text-secondary);
		box-shadow: 0 0.625rem 1.5rem rgb(0 0 0 / 0.35);
		overflow: hidden;
	}

	.select-popover:popover-open {
		display: flex;
	}

	.select-search {
		width: 100%;
		margin-bottom: var(--space-1);
		padding: var(--space-2);
		border: 0;
		border-bottom: 1px solid var(--border);
		background: transparent;
		color: var(--foreground);
		font-family: inherit;
		font-size: var(--text-sm);
		outline: none;
	}

	.select-search::placeholder {
		color: var(--text-muted);
	}

	.select-list {
		display: flex;
		flex-direction: column;
		max-height: 15rem;
		overflow-y: auto;
	}

	.select-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font-family: inherit;
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
	}

	.select-option:hover,
	.select-option[data-active="true"] {
		background: var(--hover);
		color: var(--foreground);
	}

	.select-option[aria-selected="true"] {
		color: var(--foreground);
	}

	.select-option > :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: none;
	}

	:global(.select-option-mark) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1rem;
		height: 1rem;
		flex: none;
		color: var(--accent);
	}

	:global(.select-option-mark > svg) {
		width: 1rem;
		height: 1rem;
	}

	:global(.select-option-label) {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.select-option-count) {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.select-empty {
		margin: 0;
		padding: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.select-footer {
		padding-top: var(--space-1);
		border-top: 1px solid var(--border);
	}

	.select-footer :global(button) {
		width: 100%;
		padding: var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font-family: inherit;
		font-size: var(--text-sm);
		text-align: left;
		cursor: pointer;
	}

	.select-footer :global(button:hover) {
		background: var(--hover);
		color: var(--foreground);
	}
</style>
