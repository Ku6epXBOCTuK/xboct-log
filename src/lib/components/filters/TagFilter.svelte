<script lang="ts">
	import type { TagCount } from "#lib/tasks/filter.ts";
	import Check from "~icons/lucide/check";
	import ChevronDown from "~icons/lucide/chevron-down";
	import Tag from "~icons/lucide/tag";

	interface Props {
		tags: TagCount[];
		selected: string[];
		ontoggle: (tag: string) => void;
		onclear: () => void;
	}

	let { tags, selected, ontoggle, onclear }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!open) return;

		function onPointerDown(event: PointerEvent) {
			if (root !== null && !root.contains(event.target as Node)) {
				open = false;
			}
		}

		function onKeydown(event: KeyboardEvent) {
			if (event.key === "Escape") open = false;
		}

		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeydown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeydown);
		};
	});
</script>

<div class="tag-filter" bind:this={root}>
	<button
		class="select-filter"
		class:active={selected.length > 0}
		onclick={() => (open = !open)}
		aria-haspopup="true"
		aria-expanded={open}
	>
		<Tag /> Tags
		<strong>
			({selected.length > 0
				? `${selected.length}/${tags.length}`
				: tags.length})
		</strong>
		<ChevronDown />
	</button>
	{#if open}
		<div class="tag-menu" role="menu">
			{#if tags.length === 0}
				<p class="tag-menu-empty">No tags yet</p>
			{:else}
				{#each tags as item (item.tag)}
					<button
						class="tag-option"
						class:active={selected.includes(item.tag)}
						role="menuitemcheckbox"
						aria-checked={selected.includes(item.tag)}
						onclick={() => ontoggle(item.tag)}
					>
						<span class="tag-option-check">
							{#if selected.includes(item.tag)}
								<Check />
							{/if}
						</span>
						<span class="tag-option-name">#{item.tag}</span>
						<span class="tag-option-count">{item.count}</span>
					</button>
				{/each}
				{#if selected.length > 0}
					<button class="tag-menu-clear" onclick={onclear}> Clear tags </button>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.tag-filter {
		position: relative;
	}

	.tag-menu {
		position: absolute;
		top: calc(100% + var(--space-1));
		left: 0;
		z-index: 20;
		min-width: 13rem;
		max-height: 16rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		padding: var(--space-1);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--panel);
		box-shadow: 0 0.625rem 1.5rem rgb(0 0 0 / 0.35);
	}

	.tag-option {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		text-align: left;
	}

	.tag-option:hover {
		background: var(--hover);
		color: var(--foreground);
	}

	.tag-option.active {
		color: var(--foreground);
	}

	.tag-option-check {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1rem;
		height: 1rem;
		flex: none;
		color: var(--accent);
	}

	.tag-option-check :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.tag-option-name {
		flex: 1 1 auto;
	}

	.tag-option-count {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.tag-menu-empty {
		margin: 0;
		padding: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.tag-menu-clear {
		margin-top: var(--space-1);
		padding: var(--space-2);
		border: 0;
		border-top: 1px solid var(--border);
		border-radius: 0;
		background: transparent;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.tag-menu-clear:hover {
		color: var(--foreground);
	}
</style>
