<script lang="ts">
	import AttachmentBody from "#lib/components/attachments/AttachmentBody.svelte";
	import AttachmentSection from "#lib/components/attachments/AttachmentSection.svelte";
	import type { SavedAttachmentsStore } from "#lib/state/attachments.svelte.ts";
	import { ATTACHMENT_ACCEPT } from "#lib/tasks/attachment-kinds.ts";

	interface Props {
		store: SavedAttachmentsStore;
	}

	let { store }: Props = $props();

	function paste(event: ClipboardEvent) {
		if (document.querySelector("dialog[open]") !== null) return;
		const files = [...(event.clipboardData?.files ?? [])];
		if (files.length === 0) return;
		event.preventDefault();
		void store.addFiles(files);
	}

	function upload(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const files = [...(target.files ?? [])];
		target.value = "";
		void store.addFiles(files);
	}
</script>

<svelte:window onpaste={paste} />

{#snippet hidden()}
	<input
		bind:this={store.input}
		type="file"
		multiple
		accept={ATTACHMENT_ACCEPT}
		hidden
		onchange={upload}
	/>
{/snippet}

<AttachmentSection
	count={store.count}
	fresh={store.fresh}
	busy={store.busy}
	denied={store.denied}
	notice={store.notice}
	onpick={store.openPicker}
	{hidden}
>
	<AttachmentBody
		items={store.entries}
		busy={store.busy}
		failure={store.failure}
		failed={store.failed}
		onremove={store.remove}
		onretry={store.reload}
	/>
</AttachmentSection>
