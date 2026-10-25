<script lang="ts">
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import { formatSize } from "#lib/tasks/attachments.ts";
	import Paperclip from "~icons/lucide/paperclip";
	import Trash2 from "~icons/lucide/trash-2";

	interface Props {
		name: string;
		size: number;
		src?: string;
		file?: File;
		missing?: boolean;
		busy?: boolean;
		onremove: () => void;
	}

	let {
		name,
		size,
		src,
		file,
		missing = false,
		busy = false,
		onremove,
	}: Props = $props();

	let preview = $state<string | undefined>();

	$effect(() => {
		if (file === undefined || !file.type.startsWith("image/")) return;
		const url = URL.createObjectURL(file);
		preview = url;
		return () => URL.revokeObjectURL(url);
	});

	const image = $derived(src ?? preview);
</script>

<li class="attachment" class:missing>
	{#if missing}
		<span class="attachment-icon"><Paperclip /></span>
		<span class="attachment-name">{name}</span>
		<span class="attachment-gone">the file is gone from the media folder</span>
	{:else if image !== undefined}
		<img class="attachment-image" src={image} alt={name} />
		<span class="attachment-name">{name}</span>
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
</style>
