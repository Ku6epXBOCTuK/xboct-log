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

<h3>Items</h3>

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
	h3 {
		margin: 0;
		font-size: var(--ui-fs-md);
	}

	.error-text {
		margin: 0;
		color: var(--ui-danger);
		font-size: var(--ui-fs-sm);
	}

	.empty {
		margin: 0;
		color: var(--ui-fg-muted);
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
