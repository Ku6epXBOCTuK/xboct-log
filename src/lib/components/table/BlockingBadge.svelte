<script lang="ts">
	import InfoPopover from "@ku6epxboctuk/ui-kit/components/InfoPopover.svelte";
	import ArrowUpRight from "~icons/lucide/arrow-up-right";

	interface Props {
		blocked: string[];
	}

	let { blocked }: Props = $props();

	const text = $derived(`Blocks ${blocked.join(", ")}`);
</script>

{#if blocked.length > 0}
	<span class="blocking-badge">
		<InfoPopover {text} class="blocking-icon">
			{#snippet icon()}
				<ArrowUpRight />
			{/snippet}
			{blocked.length}
		</InfoPopover>
	</span>
{/if}

<style>
	.blocking-badge {
		display: inline-flex;
		flex: none;
	}

	.blocking-badge :global(.ui-info-popover-trigger.blocking-icon) {
		padding: var(--space-1);
		color: var(--priority-high);
	}
</style>
