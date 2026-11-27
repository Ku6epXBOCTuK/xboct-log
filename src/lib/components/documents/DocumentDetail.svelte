<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import MarkdownEditor from "#lib/components/markdown/MarkdownEditor.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type { DocumentPage } from "#lib/state/documents/page.svelte.ts";
	import DocumentRevisions from "./DocumentRevisions.svelte";
	import DocumentStatusSelect from "./DocumentStatusSelect.svelte";

	interface Props {
		store: DocumentPage;
	}

	let { store }: Props = $props();
</script>

<div class="detail">
	{#if store.failedDetail}
		<ErrorNote message="The document could not be saved" />
	{/if}
	{#if store.detail}
		{@const detail = store.detail}
		<header class="detail-head">
			<h2>{detail.key} — {detail.title}</h2>
			<DocumentStatusSelect
				value={detail.status}
				statuses={store.statuses}
				onchange={(status) => void store.setStatus(status)}
			/>
			<button onclick={() => void store.toggleDelete(detail)}>
				{detail.deleted_at === null ? "Delete" : "Restore"}
			</button>
		</header>
		<MarkdownEditor
			bind:value={store.draft.body}
			label="Document body"
			placeholder="Document body"
			repo={null}
			target={detail.id}
			height="24rem"
			resizable
		/>
		<div class="save-row">
			<Button
				variant="primary"
				disabled={!store.dirty || store.saving}
				onclick={() => void store.save()}
			>
				Save
			</Button>
		</div>
		<DocumentRevisions revisions={store.revisions} />
	{:else}
		<p class="empty">Select a document</p>
	{/if}
</div>

<style>
	.detail {
		min-height: 0;
		overflow: auto;
		padding: 0 var(--edge-pad) var(--space-6);
	}

	.detail-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	.detail-head h2 {
		margin: 0;
		font-size: var(--text-xl);
	}

	.detail-head button {
		margin-left: auto;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		border-radius: var(--radius);
		font-size: var(--text-xs);
		cursor: pointer;
	}

	.save-row {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--space-2);
	}

	.empty {
		padding: var(--space-4) var(--edge-pad);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
