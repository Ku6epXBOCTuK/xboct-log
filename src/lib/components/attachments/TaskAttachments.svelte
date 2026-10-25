<script lang="ts">
	import { resolve } from "$app/paths";
	import {
		addTaskAttachment,
		getTaskAttachments,
		removeTaskAttachment,
	} from "#lib/remote/attachments.remote.ts";
	import { fetchFresh } from "#lib/remote/fresh.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import { fileToBase64, formatSize, isImage } from "#lib/tasks/attachments.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import type { Task, TaskAttachment } from "#lib/types.ts";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import Paperclip from "~icons/lucide/paperclip";
	import Trash2 from "~icons/lucide/trash-2";
	import Upload from "~icons/lucide/upload";

	interface Props {
		task: Task;
		tasks: TaskStore;
	}

	let { task, tasks }: Props = $props();

	let items = $state<TaskAttachment[]>([]);
	let failed = $state(false);
	let busy = $state(false);
	let failure = $state("");
	let input = $state<HTMLInputElement | null>(null);

	$effect(() => {
		const id = task.id;
		void load(id);
	});

	async function load(id: string) {
		try {
			const result = await fetchFresh(getTaskAttachments({ id }));
			items = result.items;
			failed = false;
		} catch {
			failed = true;
		}
	}

	async function addFiles(files: File[]) {
		if (files.length === 0 || busy) return;
		busy = true;
		failure = "";
		try {
			for (const file of files) {
				const content = await fileToBase64(file);
				const { item } = await addTaskAttachment({
					id: task.id,
					filename: file.name,
					content_base64: content,
					mime_type: file.type || undefined,
				});
				items = [...items, item];
				tasks.bumpAttachments(task.id, 1);
			}
		} catch (error) {
			failure = messageOf(error);
		} finally {
			busy = false;
		}
	}

	function paste(event: ClipboardEvent) {
		const files = [...(event.clipboardData?.files ?? [])];
		if (files.length === 0) return;
		event.preventDefault();
		void addFiles(files);
	}

	function upload(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const files = [...(target.files ?? [])];
		target.value = "";
		void addFiles(files);
	}

	async function remove(id: string) {
		busy = true;
		failure = "";
		try {
			await removeTaskAttachment({ id });
			items = items.filter((item) => item.id !== id);
			tasks.bumpAttachments(task.id, -1);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onpaste={paste} />

<div class="attachments">
	<div class="attachments-head">
		<span class="attachments-title">Attachments</span>
		<IconButton
			label="Attach a file"
			title="Attach a file"
			disabled={busy}
			onclick={() => input?.click()}
		>
			<Upload />
		</IconButton>
		<input bind:this={input} type="file" multiple hidden onchange={upload} />
	</div>
	<ErrorNote message={failure} />
	{#if failed}
		<p class="attachments-empty">The attachments are unavailable</p>
	{:else if items.length === 0}
		<p class="attachments-empty">No files</p>
	{:else}
		<ul class="attachment-list">
			{#each items as item (item.id)}
				<li class="attachment" class:missing={item.missing}>
					{#if item.missing}
						<span class="attachment-icon"><Paperclip /></span>
						<span class="attachment-name">{item.file_name}</span>
						<span class="attachment-gone"
							>the file is gone from the media folder</span
						>
					{:else if isImage(item.mime_type)}
						<img
							class="attachment-image"
							src={resolve("/media/[id]", { id: item.id })}
							alt={item.file_name}
						/>
						<span class="attachment-name">{item.file_name}</span>
					{:else}
						<span class="attachment-icon"><Paperclip /></span>
						<span class="attachment-name">{item.file_name}</span>
					{/if}
					<span class="attachment-size">{formatSize(item.size)}</span>
					<IconButton
						label="Delete the attachment"
						title="Delete the attachment"
						disabled={busy}
						onclick={() => remove(item.id)}
					>
						<Trash2 />
					</IconButton>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.attachments {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.attachments-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.attachments-title {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.attachments-empty {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.attachment-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

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
