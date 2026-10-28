<script lang="ts">
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import Modal from "@ku6epxboctuk/ui-kit/components/Modal";
	import { formatSize } from "#lib/tasks/attachments.ts";
	import Paperclip from "~icons/lucide/paperclip";
	import Trash2 from "~icons/lucide/trash-2";

	interface Props {
		name: string;
		size: number;
		src?: string;
		href?: string;
		file?: File;
		missing?: boolean;
		busy?: boolean;
		onremove: () => void;
	}

	let {
		name,
		size,
		src,
		href,
		file,
		missing = false,
		busy = false,
		onremove,
	}: Props = $props();

	let preview = $state<string | undefined>();
	let viewer = $state(false);

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
			window.open(href, "_blank", "noopener");
		}
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
				<img class="attachment-image" src={image} alt={name} />
			{:else}
				<span class="attachment-icon"><Paperclip /></span>
			{/if}
			<span class="attachment-name">{name}</span>
		</button>
	{:else}
		<span class="attachment-icon"><Paperclip /></span>
		<span class="attachment-name">{name}</span>
	{/if}
	<span class="attachment-size">{formatSize(size)}</span>
	<IconButton
		label="Remove the attachment"
		title="Remove the attachment"
		disabled={busy}
		onclick={onremove}
	>
		<Trash2 />
	</IconButton>
</li>

{#if viewer && image !== undefined}
	<Modal
		open={true}
		title={name}
		label="Attachment preview"
		size="full"
		dismissable
		onclose={() => (viewer = false)}
	>
		<img class="lightbox-image" src={image} alt={name} />
	</Modal>
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
