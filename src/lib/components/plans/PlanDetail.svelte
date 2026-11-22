<script lang="ts">
	import type { PlanStore } from "#lib/state/plans.svelte.ts";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import PlanDocumentsSection from "./PlanDocumentsSection.svelte";
	import PlanItemsSection from "./PlanItemsSection.svelte";
	import PlanKeyEditor from "./PlanKeyEditor.svelte";
	import PlanProgress from "./PlanProgress.svelte";
	import PlanStatusSelect from "./PlanStatusSelect.svelte";

	interface Props {
		store: PlanStore;
	}

	let { store }: Props = $props();
</script>

{#if store.detail !== null}
	{@const plan = store.detail}
	<header class="detail-head">
		<h2>{plan.name}</h2>
		<PlanStatusSelect
			value={plan.status}
			saving={store.statusSaving}
			onchange={(status) => void store.changeStatus(status)}
		/>
		<PlanKeyEditor {store} {plan} />
	</header>
	<ErrorNote
		message={store.statusFailed ? "Could not change the plan status" : null}
	/>
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

	.description {
		margin: 0;
		color: var(--ui-fg-secondary);
	}
</style>
