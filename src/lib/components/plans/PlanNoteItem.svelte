<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TextArea from "@ku6epxboctuk/ui-kit/components/TextArea.svelte";
	import type { PlanNote } from "#lib/api/plans.ts";
	import type { PlanStore } from "#lib/state/plans.svelte.ts";

	interface Props {
		store: PlanStore;
		note: PlanNote;
		historyOpen: boolean;
	}

	let { store, note, historyOpen }: Props = $props();
	const editing = $derived(store.editingNote === note.id);
	const deleted = $derived(note.deleted_at !== null);

	function save(): void {
		void store.editNote(note.id, store.editDraft, store.editingVersion);
	}
</script>

<div class="note" class:note-deleted={deleted}>
	{#if editing && !deleted}
		<TextArea
			aria-label="Edit note"
			value={store.editDraft}
			oninput={(event) => store.setEditDraft(event.currentTarget.value)}
		/>
		<Button type="button" onclick={save}>Save</Button>
		<Button type="button" onclick={() => store.cancelEditNote()}>Cancel</Button>
	{:else}
		<span class="note-body">{note.body}</span>
		{#if deleted}
			<span class="item-deleted">deleted</span>
			<Button type="button" onclick={() => void store.restoreNote(note.id)}>
				Restore
			</Button>
		{:else}
			<Button type="button" onclick={() => store.startEditNote(note)}>
				Edit
			</Button>
			<Button type="button" onclick={() => void store.removeNote(note.id)}>
				Delete
			</Button>
		{/if}
		<Button type="button" onclick={() => void store.showRevisions(note.id)}>
			History
		</Button>
	{/if}
</div>

{#if historyOpen}
	<div class="note-history">
		{#if store.revisions.length === 0}
			<span class="note-empty">No earlier text</span>
		{:else}
			{#each store.revisions as revision (revision.id)}
				<div class="revision">
					<time>{revision.created_at}</time>
					<pre>{revision.body}</pre>
				</div>
			{/each}
		{/if}
	</div>
{/if}

<style>
	.note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ui-space-1);
	}

	.note-body {
		flex: 1 1 auto;
		min-width: 0;
	}

	.item-deleted {
		color: var(--ui-warning);
		font-size: var(--ui-fs-sm);
	}

	.note-history {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-1);
	}

	.revision {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-1);
	}

	.revision time,
	.note-empty {
		color: var(--ui-fg-muted);
		font-size: var(--ui-fs-xs);
	}

	pre {
		margin: 0;
		padding: var(--ui-space-2);
		border: var(--ui-line-w) solid var(--ui-line);
		background: var(--ui-panel);
		font-family: var(--ui-font-mono);
		white-space: pre-wrap;
	}
</style>
