<script lang="ts">
	import Modal from "@ku6epxboctuk/ui-kit/components/Modal";
	import CopyImageButton from "#lib/components/ui/CopyImageButton.svelte";
	import { openMedia } from "#lib/host/embed.ts";

	interface Props {
		src: string;
		alt?: string;
		title?: string;
		onclose: () => void;
	}

	let { src, alt = "", title = "Image", onclose }: Props = $props();

	let image = $state<HTMLImageElement>();
</script>

<Modal
	open={true}
	{title}
	label="Image preview"
	size="full"
	dismissable
	{onclose}
>
	{#snippet actions()}
		<CopyImageButton
			{image}
			label="Copy the image"
			onfail={() => openMedia(src)}
		/>
	{/snippet}
	<div class="lightbox">
		<img bind:this={image} class="lightbox-image" {src} {alt} />
	</div>
</Modal>

<style>
	.lightbox {
		display: flex;
		justify-content: center;
	}

	.lightbox-image {
		display: block;
		width: auto;
		height: auto;
		max-width: calc(100dvw - 2 * var(--edge-pad) - 2 * var(--space-3));
		max-height: calc(100dvh - 7rem);
		object-fit: contain;
		border-radius: var(--radius-sm);
	}
</style>
