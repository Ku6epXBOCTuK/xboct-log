<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";
	import {
		getDocumentRevisions,
		getDocuments,
		type Document,
		type DocumentKind,
		type DocumentStatus,
		type TextRevision,
	} from "#lib/api/documents.ts";
	import { fetchFresh } from "#lib/api/fresh.ts";
	import MarkdownEditor from "#lib/components/markdown/MarkdownEditor.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { createDocumentStore } from "#lib/state/documents.svelte.ts";
	import { page } from "$app/state";
	import Plus from "~icons/lucide/plus";

	const { fresh } = useBoard();
	const store = createDocumentStore([]);

	const KINDS: DocumentKind[] = [
		"adr",
		"prd",
		"architecture",
		"research",
		"workflow",
		"guide",
		"spec",
	];
	const STATUSES: DocumentStatus[] = [
		"draft",
		"accepted",
		"superseded",
		"archived",
	];

	const project = $derived(page.params.project ?? null);
	let loaded = $state(false);
	let failed = $state(false);
	let selectedId = $state<string | null>(null);
	let detail = $state<Document | null>(null);
	let revisions = $state<TextRevision[]>([]);
	let body = $state("");
	let dirty = $state(false);
	let saving = $state(false);
	let failedDetail = $state(false);
	let newTitle = $state("");
	let newKind = $state<DocumentKind>("adr");
	let creating = $state(false);

	const documents = $derived(store.listFor(project));

	async function reload(): Promise<void> {
		try {
			const items = await fetchFresh(
				getDocuments({ project_id: project ?? undefined }),
			);
			store.replaceAll(items);
			failed = false;
		} catch {
			failed = true;
		}
		loaded = true;
	}

	async function loadDetail(id: string): Promise<void> {
		try {
			const [document, history] = await Promise.all([
				fetchFresh(getDocuments({ project_id: project ?? undefined })),
				fetchFresh(getDocumentRevisions({ document_id: id })),
			]);
			const found = document.find((item) => item.id === id) ?? null;
			detail = found;
			revisions = history;
			body = found?.body ?? "";
			dirty = false;
			failedDetail = false;
		} catch {
			failedDetail = true;
		}
	}

	async function submitNew(): Promise<void> {
		const title = newTitle.trim();
		if (title === "" || project === null) return;
		creating = true;
		try {
			const document = await store.create({
				project_id: project,
				kind: newKind,
				title,
			});
			newTitle = "";
			selectedId = document.id;
			failedDetail = false;
			await reload();
		} catch {
			failed = true;
		} finally {
			creating = false;
		}
	}

	async function save(): Promise<void> {
		if (detail === null || !dirty) return;
		saving = true;
		try {
			detail = await store.update({
				document_id: detail.id,
				patch: { body },
				expected_updated_at: detail.updated_at,
			});
			dirty = false;
			failedDetail = false;
			await loadDetail(detail.id);
		} catch {
			failedDetail = true;
		} finally {
			saving = false;
		}
	}

	async function setStatus(status: DocumentStatus): Promise<void> {
		if (detail === null) return;
		try {
			detail = await store.update({
				document_id: detail.id,
				patch: { status },
				expected_updated_at: detail.updated_at,
			});
			failedDetail = false;
		} catch {
			failedDetail = true;
		}
	}

	async function toggleDelete(document: Document): Promise<void> {
		try {
			if (document.deleted_at === null) {
				await store.destroy(document.id);
				if (selectedId === document.id) {
					selectedId = null;
					detail = null;
				}
			} else {
				await store.restore(document);
			}
			failed = false;
		} catch {
			failed = true;
		}
	}

	$effect(() => {
		void reload();
	});

	$effect(() => {
		const offDocuments = fresh.register("documents", () => void reload());
		return () => offDocuments();
	});

	$effect(() => {
		const id = selectedId;
		if (id === null) {
			detail = null;
			revisions = [];
			return;
		}
		void loadDetail(id);
	});
</script>

<section class="documents-page">
	<header class="page-head">
		<h1>Documents</h1>
		<span class="muted">{documents.length} documents</span>
	</header>

	{#if project !== null}
		<div class="toolbar">
			<form
				class="create"
				onsubmit={(event) => {
					event.preventDefault();
					void submitNew();
				}}
			>
				<select class="kind" aria-label="Document kind" bind:value={newKind}>
					{#each KINDS as kind (kind)}
						<option value={kind}>{kind}</option>
					{/each}
				</select>
				<TextInput
					class="create-input"
					placeholder="New document"
					aria-label="New document title"
					maxlength={200}
					bind:value={newTitle}
				/>
				<Button
					variant="primary"
					type="submit"
					disabled={creating || newTitle.trim() === ""}
					title="Create a document"
				>
					{#snippet icon()}
						<Plus />
					{/snippet}
					Create
				</Button>
			</form>
		</div>
	{/if}

	{#if failed}
		<div class="error-wrap">
			<ErrorNote message="Documents are unavailable" />
		</div>
	{/if}

	{#if !loaded}
		<p class="empty">Loading…</p>
	{:else if documents.length === 0}
		<p class="empty">No documents yet</p>
	{:else}
		<div class="columns">
			<ul class="document-list">
				{#each documents as document (document.id)}
					<li>
						<button
							class="document-link"
							class:active={document.id === selectedId}
							onclick={() => (selectedId = document.id)}
						>
							<span class="document-key">{document.key}</span>
							<span class="document-title">{document.title}</span>
							<span class="document-meta">
								{document.kind}
								· {document.status}{document.deleted_at === null
									? ""
									: " · deleted"}
							</span>
						</button>
					</li>
				{/each}
			</ul>

			<div class="detail">
				{#if failedDetail}
					<ErrorNote message="The document could not be saved" />
				{/if}
				{#if detail}
					<header class="detail-head">
						<h2>{detail.key} — {detail.title}</h2>
						<select
							aria-label="Document status"
							value={detail.status}
							onchange={(event) =>
								void setStatus(event.currentTarget.value as DocumentStatus)}
						>
							{#each STATUSES as status (status)}
								<option value={status}>{status}</option>
							{/each}
						</select>
						<button onclick={() => void toggleDelete(detail!)}>
							{detail.deleted_at === null ? "Delete" : "Restore"}
						</button>
					</header>
					<MarkdownEditor
						bind:value={body}
						label="Document body"
						placeholder="Document body"
						repo={null}
						target={detail.id}
						height="24rem"
						resizable
						oninput={() => (dirty = true)}
					/>
					<div class="save-row">
						<Button
							variant="primary"
							disabled={!dirty || saving}
							onclick={() => void save()}
						>
							Save
						</Button>
					</div>
					<h3>Previous versions</h3>
					{#if revisions.length === 0}
						<p class="empty">No previous versions</p>
					{:else}
						{#each revisions as revision (revision.id)}
							<details class="revision">
								<summary>{revision.created_at} · {revision.field}</summary>
								<pre>{revision.body}</pre>
							</details>
						{/each}
					{/if}
				{:else}
					<p class="empty">Select a document</p>
				{/if}
			</div>
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

	.page-head {
		flex: none;
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--edge-pad) var(--edge-pad) var(--space-3);
	}

	.page-head h1 {
		margin: 0;
		font-size: var(--text-2xl);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.toolbar {
		flex: none;
		padding: 0 var(--edge-pad) var(--space-3);
	}

	.create {
		display: flex;
		gap: var(--space-2);
	}

	.create :global(.create-input) {
		max-width: 22rem;
	}

	.kind,
	.detail-head select {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: var(--text-sm);
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

	.document-list {
		min-height: 0;
		overflow: auto;
		margin: 0;
		padding: 0 var(--space-2) var(--space-6) var(--edge-pad);
		list-style: none;
		border-right: 1px solid var(--border);
	}

	.document-link {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-secondary);
		text-align: left;
		cursor: pointer;
	}

	.document-link:hover {
		background: var(--hover);
	}

	.document-link.active {
		background: var(--selected);
		color: var(--foreground);
	}

	.document-key {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.document-title {
		font-size: var(--text-md);
	}

	.document-meta {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

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

	.detail h3 {
		margin: var(--space-5) 0 var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
		text-transform: uppercase;
	}

	.revision {
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}

	.revision pre {
		white-space: pre-wrap;
	}

	@media (max-width: 48rem) {
		.columns {
			grid-template-columns: minmax(0, 1fr);
			overflow: auto;
		}

		.document-list {
			max-height: 16rem;
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}
	}
</style>
