<script lang="ts">
	import type { Snippet } from "svelte";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import ChevronDown from "~icons/lucide/chevron-down";
	import InfoPopover from "#lib/components/ui/InfoPopover.svelte";

	interface Props {
		title: string;
		open?: boolean;
		onopenchange?: (open: boolean) => void;
		count?: number;
		actions?: Snippet;
		children?: Snippet;
	}

	let {
		title,
		open = $bindable(true),
		onopenchange,
		count = 0,
		actions,
		children,
	}: Props = $props();

	function toggle() {
		open = !open;
		onopenchange?.(open);
	}
</script>

<div class="section">
	<div class="section-divider">
		<span class="section-title">{title}</span>
		{#if !open && count > 0}
			<InfoPopover
				text={`${count} filled fields are hidden`}
				class="section-count"
			>
				{count}
			</InfoPopover>
		{/if}
		{@render actions?.()}
		<span class="section-line" aria-hidden="true"></span>
		<IconButton
			label={open ? `Collapse ${title}` : `Expand ${title}`}
			class="section-toggle"
			expanded={open}
			onclick={toggle}
		>
			<span class="chevron" class:is-open={open}>
				<ChevronDown />
			</span>
		</IconButton>
	</div>
	{#if open}
		{@render children?.()}
	{/if}
</div>

<style>
	.section-divider {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.section-title {
		flex: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.section-line {
		flex: 1 1 auto;
		height: 2px;
		border-radius: 1px;
		background: var(--border);
	}

	.section-divider :global(.section-toggle) {
		flex: none;
	}

	.chevron {
		display: inline-flex;
		transform: rotate(-90deg);
		transition: transform 150ms ease;
	}

	.chevron.is-open {
		transform: rotate(0deg);
	}

	.section-divider :global(.info-popover-trigger.section-count) {
		color: var(--priority-high);
		font-family: inherit;
		font-weight: 600;
	}
</style>
