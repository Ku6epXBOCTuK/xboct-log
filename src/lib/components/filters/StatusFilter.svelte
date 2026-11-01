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
		hideBacklog: boolean;
		ontogglebacklog: () => void;
	}

	let {
		value,
		onselect,
		hideClosed,
		ontoggleclosed,
		hideBacklog,
		ontogglebacklog,
	}: Props = $props();
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
		class="filter-chip hide-chip"
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
	<button
		class="filter-chip hide-chip"
		class:on={hideBacklog}
		aria-pressed={hideBacklog}
		title={hideBacklog
			? "Backlog tasks are hidden"
			: "Backlog tasks are visible"}
		onclick={ontogglebacklog}
	>
		{#if hideBacklog}
			<EyeOff />
		{:else}
			<Eye />
		{/if}
		backlog
	</button>
</div>

<style>
	.hide-chip :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
		flex: none;
	}

	.filter-group .hide-chip.on {
		border-style: dashed;
		border-color: var(--border);
		background: transparent;
		color: var(--text-muted);
	}

	.filter-group .hide-chip.on:hover {
		border-color: var(--border-strong);
		background: var(--hover);
		color: var(--text-secondary);
	}
</style>
