<script lang="ts">
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { STATUS_LABELS } from "#lib/tasks/display.ts";
	import { STATUSES, type Status } from "#lib/types.ts";

	interface Props {
		value: Status | "all";
		onselect: (value: Status | "all") => void;
	}

	let { value, onselect }: Props = $props();
</script>

<div class="filter-group">
	<span class="filter-label">Status</span>
	{#each STATUSES as option (option)}
		<button
			onclick={() => onselect(value === option ? "all" : option)}
			class={`filter-chip ${value === option ? "active" : ""}`}
		>
			<StatusDot status={option} />
			{STATUS_LABELS[option]}
		</button>
	{/each}
</div>
