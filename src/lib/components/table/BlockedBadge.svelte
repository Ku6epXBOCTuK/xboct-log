<script lang="ts">
	import Ban from "~icons/lucide/ban";
	import Clock from "~icons/lucide/clock";
	import Info from "~icons/lucide/info";

	interface Props {
		blockers: string[];
		reason: string | null;
	}

	let { blockers, reason }: Props = $props();

	const waitingFor = $derived(reason ?? "");
	const externalBlock = $derived(blockers.length === 0 && waitingFor !== "");
</script>

{#if blockers.length > 0}
	<span
		class="blocker-icon"
		title={`Blocked by ${blockers.join(", ")}`}
		aria-label={`Blocked by ${blockers.join(", ")}`}
	>
		<Ban />
		{blockers.length}
	</span>
{:else if externalBlock}
	<span
		class="blocker-icon"
		title={`Waiting for: ${waitingFor}`}
		aria-label={`Waiting for: ${waitingFor}`}
	>
		<Clock />
	</span>
{:else}
	<span
		class="blocker-icon blocker-empty"
		title="Blocked, no reason given"
		aria-label="Blocked, no reason given"
	>
		<Info />
	</span>
{/if}

<style>
	.blocker-icon {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--accent-ink);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		line-height: 1;
		cursor: help;
		flex: none;
	}

	.blocker-icon :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
	}

	.blocker-empty {
		color: var(--text-muted);
	}
</style>
