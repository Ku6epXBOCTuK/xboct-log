<script lang="ts">
	import Badge from "@ku6epxboctuk/ui-kit/components/Badge.svelte";
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import ConfirmDialog from "@ku6epxboctuk/ui-kit/components/ConfirmDialog.svelte";
	import { taskHref } from "#lib/navigation/href.ts";
	import type { PlanStore } from "#lib/state/plans.svelte.ts";
	import { blockedByIds } from "#lib/tasks/blocking.ts";
	import type { Task } from "#lib/types.ts";
	import PlanNoteForm from "./PlanNoteForm.svelte";
	import PlanNoteItem from "./PlanNoteItem.svelte";

	interface Props {
		store: PlanStore;
		planId: string;
		item: Task;
		onremove: () => void;
	}

	let { store, planId, item, onremove }: Props = $props();
	const notes = $derived(store.notesFor(item.id));
	const deletedNotes = $derived(store.deletedNotesFor(item.id));
	const blockers = $derived(
		blockedByIds(item).map((id) => ({ id, href: store.linkFor(id) })),
	);
	let confirmingRemove = $state(false);
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
		<Button
			class="item-remove"
			variant="ghost"
			size="sm"
			type="button"
			onclick={() => (confirmingRemove = true)}
		>
			Remove
		</Button>
	</div>
	{#if item.status === "blocked"}
		<div class="item-blockers">
			<Badge tone="warning" variant="outline">blocked</Badge>
			<span>blocked by</span>
			{#each blockers as blocker (blocker.id)}
				{#if blocker.href !== null}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href comes from taskHref() through store.linkFor() -->
					<a href={blocker.href} draggable="false">{blocker.id}</a>
				{:else}
					<span>{blocker.id}</span>
				{/if}
			{/each}
		</div>
	{/if}
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
	<ConfirmDialog
		open={confirmingRemove}
		title={`Remove ${item.id} from the plan?`}
		body="The task stays in the project. Only its place in this plan is removed."
		confirmLabel="Remove"
		cancelLabel="Cancel"
		danger
		onconfirm={() => {
			confirmingRemove = false;
			onremove();
		}}
		oncancel={() => (confirmingRemove = false)}
	/>
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

	:global(.item-remove) {
		margin-left: auto;
	}

	.item-blockers {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ui-space-1);
		color: var(--ui-fg-muted);
		font-size: var(--ui-fs-sm);
	}

	.item-notes {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-1);
		cursor: default;
	}
</style>
