<script lang="ts">
	import type { PlanStore } from "#lib/state/plans.svelte.ts";
	import PlanItemCard from "./PlanItemCard.svelte";
	import TaskAddPicker from "./TaskAddPicker.svelte";

	interface Props {
		store: PlanStore;
		planId: string;
	}

	let { store, planId }: Props = $props();
</script>

<div class="section-head">
	<h3>Items</h3>
	<span class="drag-hint">Drag to reorder</span>
</div>

<TaskAddPicker
	items={store.candidates}
	value={store.items.map((item) => item.id)}
	onadd={(id) => void store.addItem(planId, id)}
/>

{#if store.itemFailed}
	<p class="error-text">Could not change the plan items</p>
{/if}

{#if store.items.length === 0}
	<p class="empty">No items in this plan</p>
{:else}
	{#if store.reorderFailed}
		<p class="error-text">Could not save the new order</p>
	{/if}
	<ol class="items">
		{#each store.items as item (item.id)}
			<PlanItemCard
				{store}
				{planId}
				{item}
				onremove={() => void store.removeItem(planId, item.id)}
			/>
		{/each}
	</ol>
{/if}

{#if store.notesFailed}
	<p class="error-text">Could not save the note</p>
{/if}

{#if store.revisionsFailed}
	<p class="error-text">Could not load note history</p>
{/if}

<style>
	.section-head {
		display: flex;
		align-items: center;
		gap: var(--ui-space-2);
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

	.drag-hint {
		margin-left: auto;
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

	.items {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
