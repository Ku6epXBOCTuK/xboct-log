<script lang="ts">
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import type { Snippet } from "svelte";
	import ArrowLeft from "~icons/lucide/arrow-left";
	import X from "~icons/lucide/x";

	interface Props {
		title: string;
		label: string;
		onback: () => void;
		onclose: () => void;
		actions?: Snippet;
		children: Snippet;
	}

	let { title, label, onback, onclose, actions, children }: Props = $props();
</script>

<div class="panel-overlay" role="dialog" aria-label={label}>
	<div class="panel-overlay-head">
		<span class="panel-overlay-title">{title}</span>
		<div class="detail-actions">
			{#if actions}
				{@render actions()}
			{/if}
			<IconButton
				label="Back to task details"
				title="Back to task details"
				onclick={onback}
			>
				<ArrowLeft />
			</IconButton>
			<IconButton label="Close task details" onclick={onclose}>
				<X />
			</IconButton>
		</div>
	</div>
	<div class="panel-overlay-body">
		{@render children()}
	</div>
</div>

<style>
	.panel-overlay {
		position: absolute;
		inset: 0;
		z-index: 20;
		background: var(--panel);
		display: flex;
		flex-direction: column;
	}

	.panel-overlay-head {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: var(--control-h);
		padding: var(--edge-pad);
		border-bottom: 1px solid var(--border);
	}

	.panel-overlay-title {
		font-size: var(--text-xl);
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.panel-overlay-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		padding: var(--space-4) var(--edge-pad) var(--space-5);
	}

	.detail-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex: none;
	}
</style>
