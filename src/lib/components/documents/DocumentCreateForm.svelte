<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";
	import type { DocumentPage } from "#lib/state/documents/page.svelte.ts";
	import Plus from "~icons/lucide/plus";

	interface Props {
		store: DocumentPage;
	}

	let { store }: Props = $props();
</script>

<form
	class="create"
	onsubmit={(event) => {
		event.preventDefault();
		void store.submitNew();
	}}
>
	<select class="kind" aria-label="Document kind" bind:value={store.form.kind}>
		{#each store.kinds as kind (kind)}
			<option value={kind}>{kind}</option>
		{/each}
	</select>
	<TextInput
		class="create-input"
		placeholder="New document"
		aria-label="New document title"
		maxlength={200}
		bind:value={store.form.title}
	/>
	<Button
		variant="primary"
		type="submit"
		disabled={store.creating || store.form.title.trim() === ""}
		title="Create a document"
	>
		{#snippet icon()}
			<Plus />
		{/snippet}
		Create
	</Button>
</form>

<style>
	.create {
		display: flex;
		gap: var(--space-2);
	}

	.create :global(.create-input) {
		max-width: 22rem;
	}

	.kind {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}
</style>
