<script lang="ts">
	import EpicFilter from "#lib/components/filters/EpicFilter.svelte";
	import TagFilter from "#lib/components/filters/TagFilter.svelte";
	import type { Filters } from "#lib/state/filters.svelte.ts";
	import type { TagCount } from "#lib/tasks/filter.ts";
	import type { Task } from "#lib/types.ts";

	interface Props {
		filters: Filters;
		epics: Task[];
		tags: TagCount[];
		visibleCount: number;
		total: number;
		countEpic: (epicId: string) => number;
	}

	let { filters, epics, tags, visibleCount, total, countEpic }: Props =
		$props();
</script>

<div class="meta-row">
	<EpicFilter
		value={filters.epic}
		{epics}
		{countEpic}
		onselect={(value) => (filters.epic = value)}
	/>
	<TagFilter
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

		.meta-row :global(.select-filter) {
			max-width: 100%;
			min-width: 0;
		}

		.meta-row :global(.tag-filter) {
			flex: 1 1 100%;
		}

		.meta-row :global(.tag-menu) {
			left: 0;
			right: 0;
			min-width: 0;
			width: auto;
		}

		.result-count {
			display: none;
		}
	}
</style>
