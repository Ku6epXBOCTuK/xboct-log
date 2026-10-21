<script lang="ts">
	import EpicFilter from "#lib/components/filters/EpicFilter.svelte";
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
	<EpicFilter
		value={filters.epic}
		{epics}
		{countEpic}
		{countActiveEpic}
		onselect={(value) => (filters.epic = value)}
	/>
	{#if scopes.length > 0}
		<ScopeFilter
			value={filters.scope}
			{scopes}
			{countScope}
			{countActiveScope}
			onselect={(value) => (filters.scope = value)}
		/>
	{/if}
	<TagFilterSelect
		{tags}
		selected={filters.selectedTags}
		ontoggle={(tag) => filters.toggleTag(tag)}
		onclear={() => filters.clearTags()}
	/>
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
