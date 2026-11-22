<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TextArea from "@ku6epxboctuk/ui-kit/components/TextArea.svelte";
	import type { PlanStore } from "#lib/state/plans.svelte.ts";

	interface Props {
		store: PlanStore;
		planId: string;
		taskId: string;
	}

	let { store, planId, taskId }: Props = $props();
	let open = $state(false);
	const body = $derived(store.noteDrafts[taskId] ?? "");
	const empty = $derived(body.trim() === "");

	function add(): void {
		void store.addNote(planId, taskId, body);
		open = false;
	}
</script>

{#if open}
	<div class="note-add">
		<TextArea
			aria-label={`Note for ${taskId}`}
			placeholder="Add a note"
			value={body}
			oninput={(event) => store.setNoteDraft(taskId, event.currentTarget.value)}
		/>
		<div class="note-actions">
			<Button type="button" disabled={empty} onclick={add}>Add note</Button>
			<Button type="button" variant="ghost" onclick={() => (open = false)}>
				Cancel
			</Button>
		</div>
	</div>
{:else}
	<Button
		class="note-toggle"
		type="button"
		variant="ghost"
		size="sm"
		onclick={() => (open = true)}
	>
		Add a note
	</Button>
{/if}

<style>
	.note-add {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-2);
	}

	.note-actions {
		display: flex;
		align-items: center;
		gap: var(--ui-space-2);
	}

	:global(.note-toggle) {
		align-self: flex-start;
	}
</style>
