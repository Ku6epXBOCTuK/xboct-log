<script lang="ts">
	import DocumentCreateForm from "#lib/components/documents/DocumentCreateForm.svelte";
	import DocumentDetail from "#lib/components/documents/DocumentDetail.svelte";
	import DocumentList from "#lib/components/documents/DocumentList.svelte";
	import AppBar from "#lib/components/layout/AppBar.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { createDocumentPage } from "#lib/state/documents/page.svelte.ts";
	import { page } from "$app/state";

	interface Props {
		initialDocumentId?: string;
	}

	let { initialDocumentId }: Props = $props();
	const { fresh } = useBoard();
	const project = $derived(page.params.project ?? null);
	const store = createDocumentPage({
		project: () => project,
		initialDocumentId: () => initialDocumentId,
	});

	$effect(() => {
		void store.reload();
	});

	$effect(() => {
		const offDocuments = fresh.register("documents", () => store.reload());
		return () => offDocuments();
	});

	$effect(() => {
		const id = store.selectedId;
		if (id === null) {
			store.clearDetail();
			return;
		}
		void store.loadDetail(id);
	});
</script>

<section class="documents-page">
	<AppBar>
		{#snippet leading()}
			<h1>Documents</h1>
			<span class="muted">{store.documents.length} documents</span>
		{/snippet}
	</AppBar>

	{#if project !== null}
		<div class="toolbar">
			<DocumentCreateForm {store} />
		</div>
	{/if}

	{#if store.failed}
		<div class="error-wrap">
			<ErrorNote message="Documents are unavailable" />
		</div>
	{/if}

	{#if !store.loaded}
		<p class="empty">Loading…</p>
	{:else if store.documents.length === 0}
		<p class="empty">No documents yet</p>
	{:else}
		<div class="columns">
			<DocumentList {store} />
			<DocumentDetail {store} />
		</div>
	{/if}
</section>

<style>
	.documents-page {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--background);
	}

	.toolbar {
		flex: none;
		padding: 0 var(--edge-pad) var(--space-3);
	}

	.error-wrap {
		margin: 0 var(--edge-pad) var(--space-3);
	}

	.empty {
		padding: var(--space-4) var(--edge-pad);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.columns {
		flex: 1 1 auto;
		min-height: 0;
		display: grid;
		grid-template-columns: 20rem minmax(0, 1fr);
	}

	@media (max-width: 48rem) {
		.columns {
			grid-template-columns: minmax(0, 1fr);
			overflow: auto;
		}
	}
</style>
