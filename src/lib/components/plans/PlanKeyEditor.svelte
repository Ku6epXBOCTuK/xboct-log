<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import type { PlanWithCounts } from "#lib/api/plans.ts";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import type { PlanStore } from "#lib/state/plans.svelte.ts";
	import PlanFieldEditor from "./PlanFieldEditor.svelte";

	interface Props {
		store: PlanStore;
		plan: PlanWithCounts;
	}

	let { store, plan }: Props = $props();
</script>

{#if store.editedField === "key"}
	<PlanFieldEditor
		field="key"
		draft={store.fieldDraft}
		saving={store.fieldSaving}
		failed={store.fieldFailed}
		oninput={(value) => store.setFieldDraft(value)}
		onsave={() => void store.saveEdit()}
		ondiscard={() => store.cancelEdit()}
	/>
{:else}
	<div class="plan-key-group">
		<Button
			class="plan-key-button"
			variant="ghost"
			type="button"
			title="Edit plan id"
			onclick={() => store.startEdit("key")}
		>
			{plan.key}
		</Button>
		<CopyButton
			size="sm"
			text={plan.key}
			label="Copy plan id"
			title="Copy plan id"
		/>
	</div>
{/if}

<style>
	.plan-key-group {
		display: flex;
		align-items: center;
		gap: var(--ui-space-1);
	}
</style>
