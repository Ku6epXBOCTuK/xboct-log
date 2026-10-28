<script lang="ts">
	import Select from "@ku6epxboctuk/ui/ui/Select";
	import { createSelect } from "@ku6epxboctuk/ui/headless/select";
	import type { TagCount } from "#lib/tasks/filter.ts";
	import Check from "~icons/lucide/check";
	import ChevronDown from "~icons/lucide/chevron-down";
	import Tag from "~icons/lucide/tag";

	interface Props {
		tags: TagCount[];
		selected: string[];
		ontoggle: (tag: string) => void;
		onclear: () => void;
		class?: string;
	}

	let {
		tags,
		selected,
		ontoggle,
		onclear,
		class: className = "",
	}: Props = $props();

	const select = createSelect<TagCount>({
		items: () => tags,
		getLabel: (item) => item.tag,
		onPick: (item) => ontoggle(item.tag),
		closeOnPick: false,
	});

	const isSelected = (item: TagCount) => selected.includes(item.tag);
</script>

{#snippet trigger()}
	<button
		type="button"
		class="ui-select-trigger"
		class:active={selected.length > 0}
		aria-haspopup="listbox"
		aria-expanded={select.open}
		aria-label="Filter by tags"
		onclick={() => select.toggle()}
	>
		<Tag />
		<span class="ui-select-trigger-label">Tags</span>
		<strong class="tag-filter-count">
			({selected.length > 0
				? `${selected.length}/${tags.length}`
				: tags.length})
		</strong>
		<span class="ui-select-trigger-caret">
			<ChevronDown />
		</span>
	</button>
{/snippet}

{#snippet option(item: TagCount)}
	<span class="ui-select-option-mark">
		{#if isSelected(item)}
			<Check />
		{/if}
	</span>
	<span class="ui-select-option-label">#{item.tag}</span>
	<span class="ui-select-option-count">{item.active}/{item.count}</span>
{/snippet}

{#snippet footer()}
	<button type="button" onclick={onclear}>Clear tags</button>
{/snippet}

<Select
	{select}
	getKey={(item) => item.tag}
	{trigger}
	{option}
	{isSelected}
	multiselect
	searchable
	searchPlaceholder="Search tags"
	listLabel="Tags"
	emptyLabel="No tags found"
	class={className}
	footer={selected.length > 0 ? footer : undefined}
/>

<style>
	.ui-select-trigger.active {
		border-color: var(--accent);
	}

	.tag-filter-count {
		color: var(--foreground);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
</style>
