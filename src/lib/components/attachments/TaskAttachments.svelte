<script lang="ts">
	import { resolve } from "$app/paths";
	import {
		addTaskAttachment,
		getTaskAttachments,
		removeTaskAttachment,
	} from "#lib/remote/attachments.remote.ts";
	import { fetchFresh } from "#lib/remote/fresh.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import { fileToBase64, isImage } from "#lib/tasks/attachments.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import type { Task, TaskAttachment } from "#lib/types.ts";
	import AttachmentItem from "#lib/components/attachments/AttachmentItem.svelte";
	import AttachmentList from "#lib/components/attachments/AttachmentList.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import IconButton from "#lib/components/ui/IconButton.svelte";
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

	export async function addFiles(files: File[]) {
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
		if (document.querySelector("dialog[open]") !== null) return;
		const images = [...(event.clipboardData?.files ?? [])].filter((file) =>
			isImage(file.type),
		);
		if (images.length === 0) return;
		event.preventDefault();
		void addFiles(images);
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
		<AttachmentList>
			{#each items as item (item.id)}
				<AttachmentItem
					name={item.file_name}
					size={item.size}
					src={isImage(item.mime_type)
						? resolve("/media/[id]", { id: item.id })
						: undefined}
					href={resolve("/media/[id]", { id: item.id })}
					missing={item.missing}
					{busy}
					onremove={() => remove(item.id)}
				/>
			{/each}
		</AttachmentList>
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
</style>
