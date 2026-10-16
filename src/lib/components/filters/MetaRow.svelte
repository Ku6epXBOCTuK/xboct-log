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
