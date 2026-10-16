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
