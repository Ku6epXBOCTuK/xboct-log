<script lang="ts">
	import InfoPopover from "#lib/components/ui/InfoPopover.svelte";

	interface Props {
		count: number;
		checked: boolean;
		onchange: (value: boolean) => void;
	}

	let { count, checked, onchange }: Props = $props();
</script>

<label class="advanced-toggle">
	<input
		type="checkbox"
		{checked}
		onchange={(event) => onchange(event.currentTarget.checked)}
	/>
	<span>Advanced</span>
	{#if count > 0}
		<InfoPopover
			text={`${count} filled fields are hidden`}
			class="advanced-count"
		>
			{count}
		</InfoPopover>
	{/if}
</label>

<style>
	.advanced-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
	}

	.advanced-toggle:hover {
		color: var(--foreground);
	}

	.advanced-toggle :global(.info-popover-trigger.advanced-count) {
		color: var(--priority-high);
		font-family: inherit;
		font-weight: 600;
	}
</style>
