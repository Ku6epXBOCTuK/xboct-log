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
	const body = $derived(store.noteDrafts[taskId] ?? "");
</script>

<div class="note-add">
	<TextArea
		aria-label={`Note for ${taskId}`}
		placeholder="Add a note"
		value={body}
		oninput={(event) => store.setNoteDraft(taskId, event.currentTarget.value)}
	/>
	<Button
		type="button"
		disabled={body.trim() === ""}
		onclick={() => void store.addNote(planId, taskId, body)}
	>
		Add note
	</Button>
</div>

<style>
	.note-add {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-1);
	}
</style>
