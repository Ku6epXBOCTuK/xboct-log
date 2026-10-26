<script lang="ts">
	import InfoPopover from "#lib/components/ui/InfoPopover.svelte";
	import Ban from "~icons/lucide/ban";
	import Clock from "~icons/lucide/clock";
	import TriangleAlert from "~icons/lucide/triangle-alert";

	interface Props {
		blockers: string[];
		reason: string | null;
	}

	let { blockers, reason }: Props = $props();

	const waitingFor = $derived(reason ?? "");
	const externalBlock = $derived(blockers.length === 0 && waitingFor !== "");
	const blockedText = $derived(`Blocked by ${blockers.join(", ")}`);
	const waitingText = $derived(`Waiting for: ${waitingFor}`);
</script>

<span class="blocked-badge">
	{#if blockers.length > 0}
		<InfoPopover text={blockedText} class="blocker-icon">
			{#snippet icon()}
				<Ban />
			{/snippet}
			{blockers.length}
		</InfoPopover>
	{:else if externalBlock}
		<InfoPopover text={waitingText} class="blocker-icon">
			{#snippet icon()}
				<Clock />
			{/snippet}
		</InfoPopover>
	{:else}
		<InfoPopover
			text="Blocked, no reason given"
			class="blocker-icon blocker-empty"
		>
			{#snippet icon()}
				<TriangleAlert />
			{/snippet}
		</InfoPopover>
	{/if}
</span>

<style>
	.blocked-badge {
		display: inline-flex;
		flex: none;
	}

	.blocked-badge :global(.info-popover-trigger.blocker-icon) {
		padding: var(--space-1);
		color: var(--accent-ink);
	}

	.blocked-badge :global(.info-popover-trigger.blocker-empty) {
		gap: 0;
		color: var(--status-blocked);
		background: color-mix(in oklch, var(--status-blocked) 40%, transparent);
	}
</style>
