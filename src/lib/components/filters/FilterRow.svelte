<script lang="ts">
	import FilterBlock from "#lib/components/filters/FilterBlock.svelte";
	import PriorityFilter from "#lib/components/filters/PriorityFilter.svelte";
	import StatusFilter from "#lib/components/filters/StatusFilter.svelte";
	import type { Priority, Status } from "#lib/types.ts";
	import X from "~icons/lucide/x";

	interface Props {
		status: Status | "all";
		priority: Priority | "all";
		hideClosed: boolean;
		statusChanged: boolean;
		priorityChanged: boolean;
		onstatus: (value: Status | "all") => void;
		onpriority: (value: Priority | "all") => void;
		ontoggleclosed: () => void;
		onresetstatus: () => void;
		onresetpriority: () => void;
		onclear: () => void;
	}

	let {
		status,
		priority,
		hideClosed,
		statusChanged,
		priorityChanged,
		onstatus,
		onpriority,
		ontoggleclosed,
		onresetstatus,
		onresetpriority,
		onclear,
	}: Props = $props();
</script>

<div class="filter-row">
	<FilterBlock label="status" active={statusChanged} onreset={onresetstatus}>
		<StatusFilter
			value={status}
			onselect={onstatus}
			{hideClosed}
			{ontoggleclosed}
		/>
	</FilterBlock>
	<FilterBlock
		label="priority"
		active={priorityChanged}
		onreset={onresetpriority}
	>
		<PriorityFilter value={priority} onselect={onpriority} />
	</FilterBlock>
	<button class="clear-filters" onclick={onclear}>
		<X /> Clear
	</button>
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
