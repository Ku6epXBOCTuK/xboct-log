<script lang="ts">
	import type { Snippet } from "svelte";
	import AttachButton from "#lib/components/attachments/AttachButton.svelte";
	import SectionDivider from "#lib/components/ui/SectionDivider.svelte";

	interface Props {
		count: number;
		fresh?: boolean;
		busy?: boolean;
		denied?: boolean;
		notice?: string;
		onpick: () => void;
		hidden?: Snippet;
		children?: Snippet;
	}

	let {
		count,
		fresh = false,
		busy = false,
		denied = false,
		notice = "",
		onpick,
		hidden,
		children,
	}: Props = $props();
</script>

<div class="attachments" class:is-just-attached={fresh}>
	<SectionDivider title="Attachments">
		{#snippet actions()}
			<AttachButton {count} {fresh} {busy} {denied} {onpick} icon="upload" />
		{/snippet}
		{#if notice !== ""}
			<p class="attachments-notice" role="status">{notice}</p>
		{/if}
		{@render children?.()}
	</SectionDivider>
	{@render hidden?.()}
</div>

<style>
	.attachments {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		border-radius: var(--radius);
	}

	.attachments :global(.section-divider) {
		padding: var(--space-1) var(--space-2);
		margin: 0 calc(var(--space-2) * -1) var(--space-3);
		border-radius: var(--radius-sm);
		transition: background-color 400ms ease;
	}

	.attachments.is-just-attached :global(.section-divider) {
		background: color-mix(in oklch, var(--accent) 18%, transparent);
	}

	.attachments-notice {
		margin: 0;
		color: var(--text-secondary);
		font-size: var(--text-md);
	}
</style>
