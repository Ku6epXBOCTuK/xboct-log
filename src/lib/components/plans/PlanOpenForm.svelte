<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";

	interface Props {
		failed: boolean;
		onopen: (id: string) => Promise<boolean>;
	}

	let { failed, onopen }: Props = $props();
	let id = $state("");

	async function submit(): Promise<void> {
		if (await onopen(id)) id = "";
	}
</script>

<div class="open-wrap">
	<form
		class="open"
		onsubmit={(event) => {
			event.preventDefault();
			void submit();
		}}
	>
		<TextInput
			class="open-input"
			placeholder="PL-1"
			aria-label="Open plan by id"
			maxlength={40}
			bind:value={id}
		/>
		<Button type="submit" disabled={id.trim() === ""}>Open</Button>
	</form>
	{#if failed}
		<span class="create-error">No plan with that id</span>
	{/if}
</div>

<style>
	.open-wrap {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-1);
	}

	.open {
		display: flex;
		gap: var(--ui-space-2);
	}

	.open :global(.open-input) {
		width: calc(var(--ui-space-4) * 9);
	}

	.create-error {
		color: var(--ui-danger);
		font-size: var(--ui-fs-sm);
	}
</style>
