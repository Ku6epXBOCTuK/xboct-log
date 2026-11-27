<script lang="ts">
	import type { DocumentPage } from "#lib/state/documents/page.svelte.ts";
	import DocumentRow from "./DocumentRow.svelte";

	interface Props {
		store: DocumentPage;
	}

	let { store }: Props = $props();
</script>

<ul class="document-list">
	{#each store.documents as document (document.id)}
		<li>
			<DocumentRow
				{document}
				active={document.id === store.selectedId}
				onselect={() => store.select(document.id)}
			/>
		</li>
	{/each}
</ul>

<style>
	.document-list {
		min-height: 0;
		overflow: auto;
		margin: 0;
		padding: 0 var(--space-2) var(--space-6) var(--edge-pad);
		list-style: none;
		border-right: 1px solid var(--border);
	}

	@media (max-width: 48rem) {
		.document-list {
			max-height: 16rem;
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}
	}
</style>
