<script lang="ts">
	import { resolve } from "$app/paths";
	import AttachmentItem from "#lib/components/attachments/AttachmentItem.svelte";
	import AttachmentList from "#lib/components/attachments/AttachmentList.svelte";
	import AttachmentSection from "#lib/components/attachments/AttachmentSection.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type { TaskAttachmentsStore } from "#lib/state/task-attachments.svelte.ts";
	import { isImage } from "#lib/tasks/attachments.ts";

	interface Props {
		store: TaskAttachmentsStore;
	}

	let { store }: Props = $props();

	function paste(event: ClipboardEvent) {
		if (document.querySelector("dialog[open]") !== null) return;
		const images = [...(event.clipboardData?.files ?? [])].filter((file) =>
			isImage(file.type),
		);
		if (images.length === 0) return;
		event.preventDefault();
		void store.addFiles(images);
	}

	function upload(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const files = [...(target.files ?? [])];
		target.value = "";
		void store.addFiles(files);
	}
</script>

<svelte:window onpaste={paste} />

<div class="attachments">
	{#snippet hidden()}
		<input
			bind:this={store.input}
			type="file"
			multiple
			hidden
			onchange={upload}
		/>
	{/snippet}
	<AttachmentSection
		count={store.count}
		fresh={store.fresh}
		busy={store.busy}
		onpick={store.openPicker}
		{hidden}
	>
		<ErrorNote message={store.failure} />
		{#if store.failed}
			<p class="attachments-empty">The attachments are unavailable</p>
		{:else if store.items.length === 0}
			<p class="attachments-empty">No files</p>
		{:else}
			<AttachmentList>
				{#each store.items as item (item.id)}
					<AttachmentItem
						name={item.file_name}
						size={item.size}
						src={isImage(item.mime_type)
							? resolve("/media/[id]", { id: item.id })
							: undefined}
						href={resolve("/media/[id]", { id: item.id })}
						missing={item.missing}
						busy={store.busy}
						onremove={() => store.remove(item.id)}
					/>
				{/each}
			</AttachmentList>
		{/if}
	</AttachmentSection>
</div>

<style>
	.attachments-empty {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
