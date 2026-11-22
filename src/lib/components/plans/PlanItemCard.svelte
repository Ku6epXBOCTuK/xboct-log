<script lang="ts">
	import Badge from "@ku6epxboctuk/ui-kit/components/Badge.svelte";
	import { taskHref } from "#lib/navigation/href.ts";
	import type { PlanStore } from "#lib/state/plans.svelte.ts";
	import type { Task } from "#lib/types.ts";
	import PlanNoteForm from "./PlanNoteForm.svelte";
	import PlanNoteItem from "./PlanNoteItem.svelte";

	interface Props {
		store: PlanStore;
		planId: string;
		item: Task;
	}

	let { store, planId, item }: Props = $props();
	const notes = $derived(store.notesFor(item.id));
	const deletedNotes = $derived(store.deletedNotesFor(item.id));
</script>

<li
	class="plan-item"
	class:dragging={store.dragKey === item.id}
	draggable="true"
	ondragstart={(event) => {
		store.setDragKey(item.id);
		event.dataTransfer?.setData("text/plain", item.id);
	}}
	ondragover={(event) => event.preventDefault()}
	ondrop={(event) => {
		event.preventDefault();
		void store.moveItem(item.id);
	}}
	ondragend={() => store.setDragKey(null)}
>
	<div class="item-head">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href comes from taskHref(), which resolves the task route -->
		<a href={taskHref(item.project_id, item.id)} draggable="false">
			{item.id}
		</a>
		<span class="item-title" class:epic={item.is_epic}>{item.title}</span>
		{#if item.deleted_at !== null}
			<Badge tone="warning" variant="outline">deleted</Badge>
		{/if}
	</div>
	<div
		class="item-notes"
		draggable="false"
		role="presentation"
		ondragstart={(event) => event.stopPropagation()}
	>
		{#each notes as note (note.id)}
			<PlanNoteItem
				{store}
				{note}
				historyOpen={store.revisionNoteId === note.id}
			/>
		{/each}
		{#each deletedNotes as note (note.id)}
			<PlanNoteItem
				{store}
				{note}
				historyOpen={store.revisionNoteId === note.id}
			/>
		{/each}
		<PlanNoteForm {store} {planId} taskId={item.id} />
	</div>
</li>

<style>
	.plan-item {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-2);
		padding: var(--ui-space-3);
		border: var(--ui-line-w) solid var(--ui-line);
		border-radius: var(--ui-r-control);
		background: var(--ui-panel);
		cursor: grab;
	}

	.plan-item.dragging {
		opacity: 0.55;
	}

	.item-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ui-space-2);
	}

	.item-title {
		flex: 1 1 auto;
		min-width: 0;
	}

	.item-title.epic {
		font-weight: 600;
	}

	.item-notes {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-1);
		cursor: default;
	}
</style>
