<script lang="ts">
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { STATUS_LABELS } from "#lib/tasks/display.ts";
	import { STATUSES, type Status } from "#lib/types.ts";
	import Eye from "~icons/lucide/eye";
	import EyeOff from "~icons/lucide/eye-off";

	interface Props {
		value: Status | "all";
		onselect: (value: Status | "all") => void;
		hideClosed: boolean;
		ontoggleclosed: () => void;
	}

	let { value, onselect, hideClosed, ontoggleclosed }: Props = $props();
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
	<button
		class="filter-chip closed-chip"
		class:on={hideClosed}
		aria-pressed={hideClosed}
		title={hideClosed ? "Closed tasks are hidden" : "Closed tasks are visible"}
		onclick={ontoggleclosed}
	>
		{#if hideClosed}
			<EyeOff />
		{:else}
			<Eye />
		{/if}
		closed
	</button>
</div>

<style>
	.closed-chip :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
		flex: none;
	}

	.filter-group .closed-chip.on,
	.filter-group .closed-chip.on:hover {
		border-style: dashed;
		border-color: var(--border);
		background: transparent;
		color: var(--text-muted);
	}
</style>
