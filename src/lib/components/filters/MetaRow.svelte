<script lang="ts">
	import EpicFilter from "#lib/components/filters/EpicFilter.svelte";
	import FilterBlock from "#lib/components/filters/FilterBlock.svelte";
	import ScopeFilter from "#lib/components/filters/ScopeFilter.svelte";
	import TagFilterSelect from "#lib/components/ui/select/TagFilterSelect.svelte";
	import type { Filters } from "#lib/state/filters.svelte.ts";
	import type { TagCount } from "#lib/tasks/filter.ts";
	import type { Scope, Task } from "#lib/types.ts";

	interface Props {
		filters: Filters;
		epics: Task[];
		scopes: Scope[];
		tags: TagCount[];
		visibleCount: number;
		total: number;
		countEpic: (epicId: string) => number;
		countScope: (scopeId: number) => number;
		countActiveEpic: (epicId: string) => number;
		countActiveScope: (scopeId: number) => number;
	}

	let {
		filters,
		epics,
		scopes,
		tags,
		visibleCount,
		total,
		countEpic,
		countScope,
		countActiveEpic,
		countActiveScope,
	}: Props = $props();
</script>

<div class="meta-row">
	<FilterBlock
		label="epic"
		active={filters.epicChanged}
		onreset={() => filters.resetEpic()}
	>
		<EpicFilter
			value={filters.epic}
			{epics}
			{countEpic}
			{countActiveEpic}
			onselect={(value) => (filters.epic = value)}
		/>
	</FilterBlock>
	{#if scopes.length > 0}
		<FilterBlock
			label="scope"
			active={filters.scopeChanged}
			onreset={() => filters.resetScope()}
		>
			<ScopeFilter
				value={filters.scope}
				{scopes}
				{countScope}
				{countActiveScope}
				onselect={(value) => (filters.scope = value)}
			/>
		</FilterBlock>
	{/if}
	<FilterBlock
		label="tag"
		active={filters.tagsChanged}
		onreset={() => filters.clearTags()}
	>
		<TagFilterSelect
			{tags}
			selected={filters.selectedTags}
			ontoggle={(tag) => filters.toggleTag(tag)}
			onclear={() => filters.clearTags()}
		/>
	</FilterBlock>
	<span class="result-count">
		{visibleCount} visible / {total} total
	</span>
</div>

<style>
	.meta-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.result-count {
		margin-left: auto;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 560px) {
		.meta-row {
			flex-wrap: wrap;
			overflow: visible;
			row-gap: var(--space-2);
		}

		.meta-row :global(.select) {
			max-width: 100%;
			min-width: 0;
		}

		.result-count {
			display: none;
		}
	}
</style>
