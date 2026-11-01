<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button";
	import FilterBlock from "#lib/components/filters/FilterBlock.svelte";
	import PriorityFilter from "#lib/components/filters/PriorityFilter.svelte";
	import StatusFilter from "#lib/components/filters/StatusFilter.svelte";
	import type { Priority, Status } from "#lib/types.ts";
	import X from "~icons/lucide/x";

	interface Props {
		statuses: Status[];
		priority: Priority | "all";
		statusChanged: boolean;
		priorityChanged: boolean;
		onpick: (value: Status) => void;
		onadd: (value: Status) => void;
		onpreset: (value: Status[]) => void;
		onpriority: (value: Priority | "all") => void;
		onresetstatus: () => void;
		onresetpriority: () => void;
		onclear: () => void;
	}

	let {
		statuses,
		priority,
		statusChanged,
		priorityChanged,
		onpick,
		onadd,
		onpreset,
		onpriority,
		onresetstatus,
		onresetpriority,
		onclear,
	}: Props = $props();
</script>

<div class="filter-row">
	<FilterBlock label="status" active={statusChanged} onreset={onresetstatus}>
		<StatusFilter {statuses} {onpick} {onadd} {onpreset} />
	</FilterBlock>
	<FilterBlock
		label="priority"
		active={priorityChanged}
		onreset={onresetpriority}
	>
		<PriorityFilter value={priority} onselect={onpriority} />
	</FilterBlock>
	<Button variant="ghost" class="clear-filters" onclick={onclear}>
		{#snippet icon()}<X />{/snippet}
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
