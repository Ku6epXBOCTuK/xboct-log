<script lang="ts">
	import type { Snippet } from "svelte";
	import X from "~icons/lucide/x";
	import IconButton from "./IconButton.svelte";

	interface Props {
		open: boolean;
		title: string;
		label?: string;
		onclose: () => void;
		children: Snippet;
	}

	let { open, title, label, onclose, children }: Props = $props();

	let panel: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (open && panel !== undefined && !panel.open) {
			panel.showModal();
			return;
		}
		if (!open && panel?.open) panel.close();
	});
</script>

<dialog
	bind:this={panel}
	class="modal-panel"
	aria-label={label ?? title}
	{onclose}
>
	<div class="modal-top">
		<h2>{title}</h2>
		<IconButton label={`Close ${title}`} onclick={() => panel?.close()}>
			<X />
		</IconButton>
	</div>
	{@render children()}
</dialog>

<style>
	.modal-panel {
		width: 480px;
		max-width: calc(100vw - var(--space-8));
		max-height: calc(100vh - var(--space-12));
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel);
		color: var(--foreground);
		padding: var(--space-6);
		box-shadow: 0 1.5rem 3.75rem rgb(0 0 0 / 0.55);
	}

	.modal-panel::backdrop {
		background: rgb(0 0 0 / 0.6);
	}

	.modal-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-5);
	}

	.modal-top h2 {
		margin: 0;
		font-size: var(--text-lg);
		letter-spacing: -0.01em;
		color: var(--foreground);
	}
</style>
