<script lang="ts">
	import AttachButton from "#lib/components/attachments/AttachButton.svelte";
	import AttachmentBody from "#lib/components/attachments/AttachmentBody.svelte";
	import AttachmentSection from "#lib/components/attachments/AttachmentSection.svelte";
	import TaskEditorFields from "#lib/components/task/TaskEditorFields.svelte";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import DropOverlay from "#lib/components/ui/DropOverlay.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import { fileDrop } from "#lib/files/drop.ts";
	import { fieldNavigation } from "#lib/hotkeys/fields.ts";
	import { ATTACHMENT_ACCEPT } from "#lib/tasks/attachments/attachment-kinds.ts";
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import ScrollArea from "@ku6epxboctuk/ui-kit/components/ScrollArea.svelte";
	import { untrack } from "svelte";
	import ArrowLeft from "~icons/lucide/arrow-left";
	import Paperclip from "~icons/lucide/paperclip";
	import { createTaskForm, type TaskFormProps } from "./TaskForm.svelte.ts";

	let props: TaskFormProps = $props();
	const form = untrack(() => createTaskForm(props));
	const created = $derived(form.created);
	const last = $derived(form.last);
</script>

<svelte:window onkeydown={form.onkeydown} onpaste={form.paste} />

<form
	bind:this={form.formElement}
	onsubmit={form.submit}
	use:fieldNavigation
	use:fileDrop={{
		onfiles: (dropped) => form.attachments.addFiles(dropped),
		ondragchange: (value) => (form.dragging = value),
	}}
>
	{#snippet titleTrailing()}
		<CopyButton text={form.title} label="copy title" />
		<AttachButton
			count={form.attachments.count}
			fresh={form.attachments.fresh}
			denied={form.attachments.denied}
			onpick={form.attachments.openPicker}
		/>
	{/snippet}

	{#snippet attachments()}
		{#snippet hidden()}
			<input
				bind:this={form.attachments.input}
				type="file"
				multiple
				accept={ATTACHMENT_ACCEPT}
				hidden
				onchange={form.pickFiles}
			/>
		{/snippet}
		<AttachmentSection
			count={form.attachments.count}
			fresh={form.attachments.fresh}
			denied={form.attachments.denied}
			notice={form.attachments.notice}
			onpick={form.attachments.openPicker}
			{hidden}
		>
			<AttachmentBody
				items={form.attachments.entries}
				busy={form.saving}
				onremove={form.attachments.remove}
			/>
		</AttachmentSection>
	{/snippet}

	<ScrollArea class="panel-body">
		{#if created !== null}
			<div class="created">
				<p class="created-id">{created.id} created</p>
				<p class="created-task">{created.title}</p>
				{#if form.attachments.count > 0}
					<p class="created-hint">
						These files did not reach the task. Retry, or add them to the task
						later.
					</p>
					<AttachmentBody
						items={form.attachments.entries}
						busy={form.saving}
						onremove={form.attachments.remove}
					/>
				{/if}
				{#if form.pendingLinks.length > 0}
					<p class="created-hint">
						These links did not reach the task. Retry, or add them on the task
						page.
					</p>
					<ul class="created-links">
						{#each form.pendingLinks as line (line)}
							<li>{line}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else}
			<TaskEditorFields
				editor={form.editor}
				bind:title={form.title}
				titleId="new-task-title"
				{titleTrailing}
				{attachments}
			/>
		{/if}
	</ScrollArea>

	<div class="modal-foot">
		<ErrorNote message={form.failure} />

		<div class="modal-actions">
			{#if created === null}
				<label class="modal-check">
					<input type="checkbox" bind:checked={form.keepOpen} />
					Create another
					<kbd>Ctrl+Alt+C</kbd>
				</label>
			{:else}
				<span class="created-spacer"></span>
			{/if}
			{#if form.attachments.count > 0}
				<span class="attach-chip" class:is-fresh={form.attachments.fresh}>
					<Paperclip />
					{form.attachments.count}
					{form.attachments.count === 1 ? "file" : "files"}
				</span>
			{/if}
			{#if created === null && last}
				<button
					class="back-button"
					type="button"
					onclick={form.backToLast}
					title={last.title}
				>
					<ArrowLeft />
					{last.id}
				</button>
			{/if}
			{#if created === null}
				<Button type="button" onclick={form.cancel}>Cancel</Button>
				<Button variant="primary" type="submit" disabled={form.saving}>
					{form.saving ? "creating…" : "Create task"}
				</Button>
			{:else}
				{#if form.canOpen}
					<Button type="button" onclick={form.openCreated}>Open task</Button>
				{/if}
				<Button type="button" onclick={form.cancel}>Close</Button>
				<Button variant="primary" type="submit" disabled={form.saving}>
					{form.saving ? "saving…" : form.retryLabel}
				</Button>
			{/if}
		</div>
	</div>

	{#if form.dragging}
		<DropOverlay />
	{/if}
</form>

<style>
	.attach-chip {
		display: flex;
		align-items: center;
		flex: none;
		gap: var(--space-1);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: nowrap;
		transition: color 150ms ease;
	}

	.attach-chip :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
	}

	.attach-chip.is-fresh {
		color: var(--accent-ink);
	}

	form {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
		position: relative;
	}

	.modal-foot {
		flex: none;
		margin: 0 calc(var(--modal-pad) * -1) calc(var(--modal-pad) * -1);
		padding: var(--space-3) var(--modal-pad) var(--modal-pad);
	}

	.modal-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}

	.modal-check {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--space-2);
		margin-right: auto;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-weight: 400;
	}

	.modal-check input {
		width: auto;
		min-height: 0;
		margin: 0;
		accent-color: var(--accent);
	}

	.modal-check kbd {
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
		font-size: var(--text-xs);
		line-height: 1.35rem;
	}

	.created {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-top: var(--space-2);
	}

	.created-spacer {
		flex: 1 1 auto;
	}

	.created-id {
		margin: 0;
		color: var(--accent-ink);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.created-task {
		margin: 0;
		color: var(--foreground);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.25;
	}

	.created-hint {
		margin: var(--space-2) 0 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.created-links {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.back-button {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--panel);
		color: var(--text-secondary);
		padding: 0 var(--space-2);
		height: var(--control-h-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.back-button:hover {
		color: var(--foreground);
		background: var(--hover);
	}

	.back-button :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
		flex: none;
	}
</style>
