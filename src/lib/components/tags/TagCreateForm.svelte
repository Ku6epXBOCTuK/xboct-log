<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";
	import Plus from "~icons/lucide/plus";

	interface Props {
		busy: boolean;
		oncreate: (name: string) => Promise<boolean>;
	}

	let { busy, oncreate }: Props = $props();

	let name = $state("");

	async function submit() {
		const clean = name.trim().toLowerCase();
		if (clean === "") return;
		if (await oncreate(clean)) name = "";
	}
</script>

<form
	class="create"
	onsubmit={(event) => {
		event.preventDefault();
		void submit();
	}}
>
	<TextInput
		class="create-input"
		placeholder="New tag"
		aria-label="New tag name"
		title="Lowercase ascii, dash and underscore only"
		maxlength={20}
		bind:value={name}
	/>
	<Button
		variant="primary"
		type="submit"
		disabled={busy || name.trim() === ""}
		title="Add the tag to the dictionary"
	>
		{#snippet icon()}
			<Plus />
		{/snippet}
		Add
	</Button>
</form>

<style>
	.create {
		display: flex;
		gap: var(--space-2);
		margin-left: auto;
	}

	.create :global(.create-input) {
		width: 12rem;
	}

	@media (max-width: 820px) {
		.create {
			margin-left: 0;
			flex: 1 1 100%;
		}

		.create :global(.create-input) {
			flex: 1 1 auto;
			width: auto;
		}
	}
</style>
