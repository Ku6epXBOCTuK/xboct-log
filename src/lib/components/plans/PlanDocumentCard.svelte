<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import type { Document } from "#lib/api/documents.ts";
	import type { PlanStore } from "#lib/state/plans.svelte.ts";

	interface Props {
		store: PlanStore;
		planId: string;
		document: Document;
	}

	let { store, planId, document }: Props = $props();
</script>

<li>
	<span class="document-key">{document.key ?? document.id}</span>
	<span>{document.title}</span>
	<span class="document-kind">{document.kind}</span>
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
		gap: var(--ui-space-2);
	}

	.document-key {
		font-family: var(--ui-font-mono);
	}

	.document-kind {
		color: var(--ui-fg-muted);
		font-size: var(--ui-fs-sm);
	}
</style>
