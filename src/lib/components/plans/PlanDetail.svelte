<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import ConfirmDialog from "@ku6epxboctuk/ui-kit/components/ConfirmDialog.svelte";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton.svelte";
	import Pencil from "~icons/lucide/pencil";
	import type { PlanStore } from "#lib/state/plans.svelte.ts";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import PlanDocumentsSection from "./PlanDocumentsSection.svelte";
	import PlanFieldEditor from "./PlanFieldEditor.svelte";
	import PlanItemsSection from "./PlanItemsSection.svelte";
	import PlanKeyEditor from "./PlanKeyEditor.svelte";
	import PlanProgress from "./PlanProgress.svelte";
	import PlanStatusSelect from "./PlanStatusSelect.svelte";

	interface Props {
		store: PlanStore;
	}

	let { store }: Props = $props();
	let confirmingDelete = $state(false);
</script>

{#if store.detail !== null}
	{@const plan = store.detail}
	<header class="detail-head">
		{#if store.editedField === "name"}
			<PlanFieldEditor
				field="name"
				draft={store.fieldDraft}
				saving={store.fieldSaving}
				failed={store.fieldFailed}
				oninput={(value) => store.setFieldDraft(value)}
				onsave={() => void store.saveEdit()}
				ondiscard={() => store.cancelEdit()}
			/>
		{:else}
			<h2>{plan.name}</h2>
			<IconButton
				label="Edit plan name"
				title="Rename the plan"
				size="sm"
				onclick={() => store.startEdit("name")}
			>
				<Pencil />
			</IconButton>
		{/if}
		<PlanStatusSelect
			value={plan.status}
			saving={store.statusSaving}
			onchange={(status) => void store.changeStatus(status)}
		/>
		<PlanKeyEditor {store} {plan} />
		<Button
			class="plan-delete"
			variant="ghost"
			size="sm"
			type="button"
			onclick={() => (confirmingDelete = true)}
		>
			Delete plan
		</Button>
	</header>
	<ErrorNote
		message={store.statusFailed ? "Could not change the plan status" : null}
	/>
	<ErrorNote
		message={store.deleteFailed ? "Could not delete the plan" : null}
	/>
	<ConfirmDialog
		open={confirmingDelete}
		title={`Delete ${plan.key}?`}
		body="The plan is hidden, not erased. Its items, notes and document links can be restored."
		confirmLabel="Delete"
		cancelLabel="Cancel"
		disabled={store.deleting}
		danger
		onconfirm={() => {
			confirmingDelete = false;
			void store.deleteActive();
		}}
		oncancel={() => (confirmingDelete = false)}
	/>
	{#if store.editedField === "description"}
		<PlanFieldEditor
			field="description"
			draft={store.fieldDraft}
			saving={store.fieldSaving}
			failed={store.fieldFailed}
			oninput={(value) => store.setFieldDraft(value)}
			onsave={() => void store.saveEdit()}
			ondiscard={() => store.cancelEdit()}
		/>
	{:else if plan.description !== ""}
		<div class="description-row">
			<p class="description">{plan.description}</p>
			<IconButton
				label="Edit plan description"
				title="Edit the description"
				size="sm"
				onclick={() => store.startEdit("description")}
			>
				<Pencil />
			</IconButton>
		</div>
	{:else}
		<Button
			variant="ghost"
			size="sm"
			onclick={() => store.startEdit("description")}
		>
			Add a description
		</Button>
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

	:global(.plan-delete) {
		margin-left: auto;
	}

	.description-row {
		display: flex;
		align-items: flex-start;
		gap: var(--ui-space-1);
	}

	.description {
		margin: 0;
		color: var(--ui-fg-secondary);
	}
</style>
