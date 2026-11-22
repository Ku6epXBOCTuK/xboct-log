<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import type { Document } from "#lib/api/documents.ts";
	import { documentHref } from "#lib/navigation/href.ts";
	import type { PlanStore } from "#lib/state/plans.svelte.ts";

	interface Props {
		store: PlanStore;
		planId: string;
		document: Document;
	}

	let { store, planId, document }: Props = $props();
</script>

<li>
	<a
		class="document-link"
		href={documentHref(document.project_id, document.id)}
	>
		<span class="document-key">{document.key ?? document.id}</span>
		<span class="document-title">{document.title}</span>
		<span class="document-kind">{document.kind}</span>
	</a>
	<Button
		type="button"
		onclick={() => void store.unlinkDocument(planId, document.id)}
	>
		Unlink
	</Button>
</li>

<style>
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ui-space-3);
		padding: var(--ui-space-3);
		border: 1px solid var(--ui-line);
		background: var(--ui-panel);
	}

	.document-link {
		display: flex;
		flex: 1 1 auto;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--ui-space-2);
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}

	.document-link:hover .document-title {
		text-decoration: underline;
	}

	.document-key {
		font-family: var(--ui-font-mono);
	}

	.document-title {
		font-size: var(--ui-fs-sm);
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	.document-kind {
		color: var(--ui-fg-muted);
		font-size: var(--ui-fs-sm);
	}
</style>
