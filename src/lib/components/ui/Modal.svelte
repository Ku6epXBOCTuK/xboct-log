<script lang="ts">
	import type { Snippet } from "svelte";
	import X from "~icons/lucide/x";
	import IconButton from "./IconButton.svelte";

	interface Props {
		open: boolean;
		title: string;
		label?: string;
		size?: "default" | "wide" | "full";
		dismissable?: boolean;
		onclose: () => void;
		children: Snippet;
	}

	let {
		open,
		title,
		label,
		size = "default",
		dismissable = false,
		onclose,
		children,
	}: Props = $props();

	let panel: HTMLDialogElement | undefined = $state();
	let pressedOnBackdrop = false;

	$effect(() => {
		if (open && panel !== undefined && !panel.open) {
			panel.showModal();
			return;
		}
		if (!open && panel?.open) panel.close();
	});

	function trackPress(event: MouseEvent) {
		pressedOnBackdrop = event.target === panel;
	}

	function closeFromBackdrop(event: MouseEvent) {
		if (event.target === panel && pressedOnBackdrop) {
			panel?.close();
		}
		pressedOnBackdrop = false;
	}
</script>

<dialog
	bind:this={panel}
	class={`modal-panel modal-panel-${size}`}
	aria-label={label ?? title}
	{onclose}
	onmousedown={dismissable ? trackPress : undefined}
	onclick={dismissable ? closeFromBackdrop : undefined}
>
	<div class="modal-top">
		<h2>{title}</h2>
		<IconButton label={`Close ${title}`} onclick={() => panel?.close()}>
			<X />
		</IconButton>
	</div>
	<div class="modal-body">
		{@render children()}
	</div>
</dialog>

<style>
	.modal-panel {
		--modal-pad: var(--space-6);
		width: 480px;
		max-width: calc(100vw - var(--space-8));
		max-height: calc(100vh - var(--space-12));
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel);
		color: var(--foreground);
		padding: 0;
		box-shadow: 0 1.5rem 3.75rem rgb(0 0 0 / 0.55);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-panel:not([open]) {
		display: none;
	}

	.modal-panel-wide {
		width: 720px;
		max-height: calc(100dvh - 2 * var(--edge-pad));
	}

	.modal-panel.modal-panel-full {
		width: fit-content;
		max-width: calc(100dvw - 2 * var(--edge-pad));
		max-height: calc(100dvh - 2 * var(--edge-pad));
	}

	.modal-panel.modal-panel-full .modal-body {
		padding: 0 var(--space-3) var(--space-3);
	}

	.modal-top {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-5) var(--modal-pad) var(--space-3);
	}

	.modal-top h2 {
		margin: 0;
		font-size: var(--text-lg);
		letter-spacing: -0.01em;
		color: var(--foreground);
	}

	.modal-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		padding: 0 var(--modal-pad) var(--modal-pad);
	}

	.modal-panel::backdrop {
		background: rgb(0 0 0 / 0.6);
	}
</style>
