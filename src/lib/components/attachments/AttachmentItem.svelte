<script lang="ts">
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton.svelte";
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import CopyImageButton from "#lib/components/ui/CopyImageButton.svelte";
	import ImageViewer from "#lib/components/ui/ImageViewer.svelte";
	import { openExternal, openMedia } from "#lib/host/embed.ts";
	import {
		formatSize,
		isImage,
		type AttachmentEntry,
	} from "#lib/tasks/attachments.ts";
	import { resolve } from "$app/paths";
	import Paperclip from "~icons/lucide/paperclip";
	import Trash2 from "~icons/lucide/trash-2";

	interface Props {
		entry: AttachmentEntry;
		busy?: boolean;
		onremove: () => void;
	}

	let { entry, busy = false, onremove }: Props = $props();

	const file = $derived(entry.kind === "file" ? entry.file : undefined);
	const name = $derived(
		entry.kind === "file" ? entry.file.name : entry.attachment.file_name,
	);
	const size = $derived(
		entry.kind === "file" ? entry.file.size : entry.attachment.size,
	);
	const missing = $derived(
		entry.kind === "saved" ? entry.attachment.missing : false,
	);
	const src = $derived(
		entry.kind === "saved" && isImage(entry.attachment.mime_type)
			? resolve("/media/[id]", { id: entry.attachment.id })
			: undefined,
	);
	const href = $derived(
		entry.kind === "saved"
			? resolve("/media/[id]", { id: entry.attachment.id })
			: undefined,
	);

	let preview = $state<string | undefined>();
	let viewer = $state(false);
	let previewImage = $state<HTMLImageElement>();
	let confirming = $state(false);
	let cancelButton = $state<HTMLButtonElement>();

	$effect(() => {
		if (!confirming) return;
		cancelButton?.focus();
	});

	$effect(() => {
		if (file === undefined || !file.type.startsWith("image/")) return;
		const url = URL.createObjectURL(file);
		preview = url;
		return () => URL.revokeObjectURL(url);
	});

	const image = $derived(src ?? preview);
	const openable = $derived(image !== undefined || href !== undefined);

	function openItem() {
		if (image !== undefined) {
			viewer = true;
			return;
		}
		if (href !== undefined) {
			openExternal(new URL(href, location.href).href);
		}
	}

	function requestRemove() {
		if (entry.kind === "file") {
			onremove();
			return;
		}
		confirming = true;
	}

	function remove() {
		confirming = false;
		onremove();
	}

	function escape(event: KeyboardEvent) {
		if (event.key !== "Escape") return;
		confirming = false;
	}
</script>

<li class="attachment" class:missing>
	{#if missing}
		<span class="attachment-icon"><Paperclip /></span>
		<span class="attachment-name">{name}</span>
		<span class="attachment-gone">the file is gone from the media folder</span>
	{:else if openable}
		<button
			type="button"
			class="attachment-open"
			title={image !== undefined
				? "View the attachment"
				: "Open the attachment"}
			onclick={openItem}
		>
			{#if image !== undefined}
				<img
					bind:this={previewImage}
					class="attachment-image"
					src={image}
					alt={name}
				/>
			{:else}
				<span class="attachment-icon"><Paperclip /></span>
			{/if}
			<span class="attachment-name">{name}</span>
		</button>
	{:else}
		<span class="attachment-icon"><Paperclip /></span>
		<span class="attachment-name">{name}</span>
	{/if}
	<span class="attachment-size" class:is-hidden={confirming}>
		{formatSize(size)}
	</span>
	{#if image !== undefined && !missing && !confirming}
		<CopyImageButton
			image={previewImage}
			label="Copy the image"
			onfail={() => src !== undefined && openMedia(src)}
		/>
	{/if}
	<div class="attachment-actions">
		{#if confirming}
			<div class="attachment-confirm">
				<span class="attachment-confirm-label">Remove?</span>
				<Button
					size="sm"
					variant="danger"
					disabled={busy}
					onclick={remove}
					onkeydown={escape}
				>
					Remove
				</Button>
				<Button
					size="sm"
					bind:element={cancelButton}
					onclick={() => (confirming = false)}
					onkeydown={escape}
				>
					Cancel
				</Button>
			</div>
		{:else}
			<IconButton
				label="Remove the attachment"
				title="Remove the attachment"
				disabled={busy}
				onclick={requestRemove}
			>
				<Trash2 />
			</IconButton>
		{/if}
	</div>
</li>

{#if viewer && image !== undefined}
	<ImageViewer
		src={image}
		alt={name}
		title={name}
		onclose={() => (viewer = false)}
	/>
{/if}

<style>
	.attachment {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--field);
	}

	.attachment.missing {
		border-color: color-mix(in oklch, var(--accent) 55%, transparent);
	}

	.attachment-open {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		flex: 1 1 auto;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.attachment-open:hover .attachment-name,
	.attachment-open:focus-visible .attachment-name {
		color: var(--foreground);
		text-decoration: underline;
	}

	.attachment-image {
		width: 3rem;
		height: 3rem;
		object-fit: cover;
		border-radius: var(--radius-sm);
		background: var(--surface);
		flex: none;
	}

	.attachment-icon {
		display: inline-flex;
		color: var(--text-muted);
		flex: none;
	}

	.attachment-icon :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.attachment-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.attachment-gone {
		color: var(--accent-ink);
		font-size: var(--text-xs);
		white-space: nowrap;
	}

	.attachment-size {
		margin-left: auto;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.attachment-confirm {
		position: absolute;
		top: 50%;
		right: 0;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding-left: var(--space-2);
		background: var(--field);
		z-index: 1;
	}

	.attachment-confirm-label {
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	.attachment-actions {
		position: relative;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		width: var(--control-h);
		height: var(--control-h);
	}

	.attachment-size.is-hidden {
		visibility: hidden;
	}
</style>
