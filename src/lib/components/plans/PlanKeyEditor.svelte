<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";
	import type { PlanWithCounts } from "#lib/api/plans.ts";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import type { PlanStore } from "#lib/state/plans.svelte.ts";

	interface Props {
		store: PlanStore;
		plan: PlanWithCounts;
	}

	let { store, plan }: Props = $props();
</script>

{#if store.editingKey}
	<form
		class="key-edit"
		onsubmit={(event) => {
			event.preventDefault();
			void store.saveKey();
		}}
	>
		<TextInput
			class="key-input"
			placeholder="PL-1"
			aria-label="Plan id"
			maxlength={20}
			value={store.keyDraft}
			oninput={(event) => store.setKeyDraft(event.currentTarget.value)}
		/>
		<Button
			variant="primary"
			type="submit"
			disabled={store.keyDraft.trim() === ""}
		>
			Save
		</Button>
		<Button type="button" onclick={() => store.cancelEditKey()}>Cancel</Button>
	</form>
{:else}
	<div class="plan-key-group">
		<Button
			class="plan-key-button"
			variant="ghost"
			type="button"
			title="Edit plan id"
			onclick={() => store.startEditKey()}
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

{#if store.keyFailed}
	<p class="item-error">Use a free PL-NUMBER id</p>
{/if}

<style>
	.key-edit {
		display: flex;
		align-items: center;
		gap: var(--ui-space-2);
	}

	.plan-key-group {
		display: flex;
		align-items: center;
		gap: var(--ui-space-1);
	}

	.item-error {
		margin: 0;
		color: var(--ui-danger);
		font-size: var(--ui-fs-sm);
	}
</style>
