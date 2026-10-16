<script lang="ts">
	import PriorityFilter from "#lib/components/filters/PriorityFilter.svelte";
	import StatusFilter from "#lib/components/filters/StatusFilter.svelte";
	import type { Priority, Status } from "#lib/types.ts";
	import X from "~icons/lucide/x";

	interface Props {
		status: Status | "all";
		priority: Priority | "all";
		onstatus: (value: Status | "all") => void;
		onpriority: (value: Priority | "all") => void;
		onclear: () => void;
	}

	let { status, priority, onstatus, onpriority, onclear }: Props = $props();
</script>

<div class="filter-row">
	<StatusFilter value={status} onselect={onstatus} />
	<PriorityFilter value={priority} onselect={onpriority} />
	<button class="clear-filters" onclick={onclear}>
		<X /> Clear
	</button>
</div>
