<script lang="ts">
	import type { PlanStore } from "#lib/state/plans.svelte.ts";
	import PlanDocumentsSection from "./PlanDocumentsSection.svelte";
	import PlanItemsSection from "./PlanItemsSection.svelte";
	import PlanKeyEditor from "./PlanKeyEditor.svelte";
	import PlanProgress from "./PlanProgress.svelte";

	interface Props {
		store: PlanStore;
	}

	let { store }: Props = $props();
</script>

{#if store.detail !== null}
	{@const plan = store.detail}
	<header class="detail-head">
		<h2>{plan.name}</h2>
		<span class="status">{plan.status}</span>
		<PlanKeyEditor {store} {plan} />
	</header>
	{#if plan.description !== ""}
		<p class="description">{plan.description}</p>
	{/if}
	<PlanProgress progress={store.progress} />
	<PlanItemsSection {store} planId={plan.id} />
	<PlanDocumentsSection {store} planId={plan.id} />
{/if}

<style>
	.detail-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ui-space-2);
	}

	h2 {
		margin: 0;
	}

	.status {
		color: var(--ui-fg-muted);
		font-size: var(--ui-fs-sm);
	}

	.description {
		margin: 0;
		color: var(--ui-fg-secondary);
	}
</style>
