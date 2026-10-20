<script lang="ts" generics="T">
	import Select from "#lib/components/ui/select/Select.svelte";
	import { createSelect } from "#lib/components/ui/select/select.svelte.ts";
	import type { Snippet } from "svelte";
	import ChevronDown from "~icons/lucide/chevron-down";

	interface Props {
		items: T[];
		value: T | null;
		getKey: (item: T) => string | number;
		getLabel: (item: T) => string;
		getKeywords?: (item: T) => string;
		getMeta?: (item: T) => string;
		onselect: (item: T) => void;
		placeholder?: string;
		ariaLabel?: string;
		searchable?: boolean;
		variant?: "filter" | "field";
		icon?: Snippet;
		class?: string;
	}

	let {
		items,
		value,
		getKey,
		getLabel,
		getKeywords,
		getMeta,
		onselect,
		placeholder = "Select",
		ariaLabel,
		searchable = false,
		variant = "filter",
		icon,
		class: className = "",
	}: Props = $props();

	const select = createSelect<T>({
		items: () => items,
		getLabel: (item) => getLabel(item),
		getKeywords: (item) => getKeywords?.(item) ?? "",
		onPick: (item) => onselect(item),
	});

	const isSelected = (item: T) =>
		value !== null && getKey(item) === getKey(value);
</script>

{#snippet trigger()}
	<button
		type="button"
		class="select-trigger"
		aria-haspopup="listbox"
		aria-expanded={select.open}
		aria-label={ariaLabel}
		onclick={() => select.toggle()}
	>
		{#if icon}
			{@render icon()}
		{/if}
		<span class="select-trigger-label">
			{value === null ? placeholder : getLabel(value)}
		</span>
		{#if value !== null && getMeta !== undefined}
			<span class="select-trigger-meta">{getMeta(value)}</span>
		{/if}
		<span class="select-trigger-caret">
			<ChevronDown />
		</span>
	</button>
{/snippet}

{#snippet option(item: T)}
	<span class="select-option-label">{getLabel(item)}</span>
	{#if getMeta !== undefined}
		<span class="select-option-count">{getMeta(item)}</span>
	{/if}
{/snippet}

<Select
	{select}
	{getKey}
	{trigger}
	{option}
	{isSelected}
	{searchable}
	{variant}
	class={className}
	listLabel={ariaLabel ?? placeholder}
/>
