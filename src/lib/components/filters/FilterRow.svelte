<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import FilterBlock from "#lib/components/filters/FilterBlock.svelte";
	import PriorityFilter from "#lib/components/filters/PriorityFilter.svelte";
	import StatusFilter from "#lib/components/filters/StatusFilter.svelte";
	import type { Filters } from "#lib/state/filters.svelte.ts";
	import X from "~icons/lucide/x";

	interface Props {
		filters: Filters;
	}

	let { filters }: Props = $props();
</script>

<div class="filter-row">
	<FilterBlock
		label="status"
		active={filters.statusChanged}
		onreset={() => filters.resetStatus()}
	>
		<StatusFilter
			statuses={filters.statuses}
			onpick={(value) => filters.pickStatus(value)}
			onadd={(value) => filters.toggleStatus(value)}
			onpreset={(value) => filters.setStatuses(value)}
		/>
	</FilterBlock>
	<FilterBlock
		label="priority"
		active={filters.priorityChanged}
		onreset={() => filters.resetPriority()}
	>
		<PriorityFilter
			value={filters.priority}
			onselect={(value) => (filters.priority = value)}
		/>
	</FilterBlock>
	<Button variant="ghost" class="clear-filters" onclick={() => filters.clear()}>
		{#snippet icon()}
			<X />
		{/snippet}
		Clear
	</Button>
</div>

<style>
	.filter-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-5);
		margin-top: var(--space-4);
	}

	@media (max-width: 820px) {
		.filter-row {
			gap: var(--space-3);
		}
	}
</style>
