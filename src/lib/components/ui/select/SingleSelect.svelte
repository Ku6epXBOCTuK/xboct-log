<script lang="ts" generics="T">
	import Select from "@ku6epxboctuk/ui-kit/components/Select";
	import { createSelect } from "@ku6epxboctuk/ui-kit/headless/select";
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
		searchPlaceholder?: string;
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
		searchPlaceholder = "Search",
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

	function metaOf(item: T | null): string {
		return item === null ? "" : (getMeta?.(item) ?? "");
	}
</script>

{#snippet trigger()}
	<button
		type="button"
		class="ui-select-trigger"
		aria-haspopup="listbox"
		aria-expanded={select.open}
		aria-label={ariaLabel}
		onclick={() => select.toggle()}
	>
		{#if icon}
			{@render icon()}
		{/if}
		<span class="ui-select-trigger-label">
			{value === null ? placeholder : getLabel(value)}
		</span>
		{#if metaOf(value) !== ""}
			<span class="ui-select-trigger-meta">{metaOf(value)}</span>
		{/if}
		<span class="ui-select-trigger-caret">
			<ChevronDown />
		</span>
	</button>
{/snippet}

{#snippet option(item: T)}
	<span class="ui-select-option-label">{getLabel(item)}</span>
	{#if metaOf(item) !== ""}
		<span class="ui-select-option-count">{metaOf(item)}</span>
	{/if}
{/snippet}

<Select
	{select}
	{getKey}
	{trigger}
	{option}
	{isSelected}
	{searchable}
	{searchPlaceholder}
	{variant}
	class={className}
	listLabel={ariaLabel ?? placeholder}
/>
