<script lang="ts">
	import type { PlanStore } from "#lib/state/plans.svelte.ts";
	import PlanDocumentCard from "./PlanDocumentCard.svelte";
	import PlanDocumentPicker from "./PlanDocumentPicker.svelte";

	interface Props {
		store: PlanStore;
		planId: string;
	}

	let { store, planId }: Props = $props();
</script>

<div class="section-head">
	<h3>Documents</h3>
</div>

{#if store.documentFailed}
	<p class="error-text">Could not change the plan documents</p>
{/if}

{#if store.documentsToLink.length > 0}
	<PlanDocumentPicker {store} {planId} items={store.documentsToLink} />
{/if}

{#if store.planDocuments.length === 0}
	<p class="empty">No documents linked to this plan</p>
{:else}
	<ul class="plan-documents">
		{#each store.planDocuments as document (document.id)}
			<PlanDocumentCard {store} {planId} {document} />
		{/each}
	</ul>
{/if}

<style>
	.section-head {
		margin: var(--ui-space-5) 0 var(--ui-space-2);
		color: var(--ui-fg-secondary);
		font-family: var(--ui-font-mono);
		font-size: var(--ui-fs-sm);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	h3 {
		margin: 0;
		font-family: inherit;
		font-size: inherit;
		font-weight: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
	}

	.error-text {
		margin: 0;
		color: var(--ui-danger);
		font-size: var(--ui-fs-sm);
	}

	.empty {
		margin: 0;
		color: var(--ui-fg-secondary);
		font-size: var(--ui-fs-sm);
	}

	.plan-documents {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
