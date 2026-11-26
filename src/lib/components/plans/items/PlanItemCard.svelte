<script lang="ts">
	import Badge from "@ku6epxboctuk/ui-kit/components/Badge.svelte";
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import ConfirmDialog from "@ku6epxboctuk/ui-kit/components/ConfirmDialog.svelte";
	import { taskHref } from "#lib/navigation/href.ts";
	import type { PlanStore } from "#lib/state/plans/plans.svelte.ts";
	import { blockedByIds } from "#lib/tasks/relations/blocking.ts";
	import { CLOSED_STATUSES, type Status, type Task } from "#lib/types.ts";
	import PlanNoteForm from "#lib/components/plans/items/PlanNoteForm.svelte";
	import PlanNoteItem from "#lib/components/plans/items/PlanNoteItem.svelte";

	type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

	const STATUS_TONE: Record<Status, Tone> = {
		backlog: "neutral",
		open: "accent",
		"in-progress": "info",
		blocked: "warning",
		done: "success",
		cancelled: "neutral",
	};

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
		item.status === "blocked"
			? blockedByIds(item).map((id) => ({ id, href: store.linkFor(id) }))
			: [],
	);
	const closed = $derived(CLOSED_STATUSES.includes(item.status));
	let confirmingRemove = $state(false);
</script>

<li
	class="plan-item"
	class:blocked={item.status === "blocked"}
	class:closed={item.status === "done"}
	class:cancelled={item.status === "cancelled"}
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
	<span class="grip" aria-hidden="true">≡</span>
	<div class="item-main">
		<div class="item-tags">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href comes from taskHref(), which resolves the task route -->
			<a
				class="item-id"
				href={taskHref(item.project_id, item.id)}
				draggable="false"
			>
				{item.id}
			</a>
			<Badge size="xs" tone={STATUS_TONE[item.status]}>{item.status}</Badge>
			{#if item.deleted_at !== null}
				<Badge size="xs" tone="warning" variant="outline">deleted</Badge>
			{/if}
			{#if blockers.length > 0}
				<span class="item-blockers">
					blocked by
					{#each blockers as blocker (blocker.id)}
						{#if blocker.href !== null}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href comes from taskHref() through store.linkFor() -->
							<a href={blocker.href} draggable="false">{blocker.id}</a>
						{:else}
							<span>{blocker.id}</span>
						{/if}
					{/each}
				</span>
			{/if}
		</div>
		<span class="item-title" class:epic={item.is_epic} class:closed
			>{item.title}</span
		>
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
	</div>
	<Button
		class="item-remove"
		variant="ghost"
		size="sm"
		type="button"
		onclick={() => (confirmingRemove = true)}
	>
		Remove
	</Button>
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
		align-items: flex-start;
		gap: var(--ui-space-3);
		padding: var(--ui-space-3);
		border: 1px solid var(--ui-line);
		border-left: 3px solid var(--ui-line-strong);
		background: var(--ui-panel);
		cursor: grab;
	}

	.plan-item.blocked {
		border-left-color: var(--ui-warning);
	}

	.plan-item.closed {
		border-left-color: var(--ui-success);
		background: var(--ui-surface);
	}

	.plan-item.cancelled {
		border-left-color: var(--ui-fg-secondary);
	}

	.plan-item.dragging {
		opacity: 0.55;
	}

	.grip {
		flex: 0 0 auto;
		color: var(--ui-fg-secondary);
		font-size: var(--ui-fs-sm);
		line-height: 1.5;
		user-select: none;
	}

	.item-main {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-1);
	}

	.item-tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ui-space-1);
		min-width: 0;
	}

	.item-id {
		font-family: var(--ui-font-mono);
		font-size: var(--ui-fs-sm);
		color: inherit;
	}

	.item-id:hover {
		text-decoration: underline;
	}

	.item-title {
		font-size: var(--ui-fs-sm);
		overflow-wrap: anywhere;
	}

	.item-title.epic {
		font-weight: 600;
	}

	.item-title.closed {
		color: var(--ui-fg-secondary);
		text-decoration: line-through;
	}

	.item-blockers {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--ui-space-1);
		color: var(--ui-fg-secondary);
		font-size: var(--ui-fs-sm);
	}

	.item-notes {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-1);
		cursor: default;
	}

	:global(.item-remove) {
		flex: 0 0 auto;
		margin-left: auto;
	}
</style>
