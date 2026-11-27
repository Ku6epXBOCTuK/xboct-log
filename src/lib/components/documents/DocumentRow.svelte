<script lang="ts">
	import type { Document } from "#lib/api/plans/documents.ts";

	interface Props {
		document: Document;
		active: boolean;
		onselect: () => void;
	}

	let { document, active, onselect }: Props = $props();
</script>

<button class="document-link" class:active onclick={onselect}>
	<span class="document-key">{document.key}</span>
	<span class="document-title">{document.title}</span>
	<span class="document-meta">
		{document.kind}
		· {document.status}{document.deleted_at === null ? "" : " · deleted"}
	</span>
</button>

<style>
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
</style>
