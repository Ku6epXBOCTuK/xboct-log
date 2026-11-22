<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";
	import Plus from "~icons/lucide/plus";

	interface Props {
		count: number;
		creating: boolean;
		failed: boolean;
		oncreate: (name: string) => Promise<boolean>;
	}

	let { count, creating, failed, oncreate }: Props = $props();
	let name = $state("");

	async function submit(): Promise<void> {
		if (await oncreate(name)) name = "";
	}
</script>

<div class="create-wrap">
	<span class="muted">{count} plans</span>
	<form
		class="create"
		onsubmit={(event) => {
			event.preventDefault();
			void submit();
		}}
	>
		<TextInput
			class="create-input"
			placeholder="New plan"
			aria-label="New plan name"
			maxlength={200}
			bind:value={name}
		/>
		<Button
			variant="primary"
			type="submit"
			disabled={creating || name.trim() === ""}
			title="Create a plan"
		>
			{#snippet icon()}
				<Plus />
			{/snippet}
			Create
		</Button>
	</form>
	{#if failed}
		<span class="create-error">Could not create the plan</span>
	{/if}
</div>

<style>
	.create-wrap {
		display: flex;
		align-items: center;
		gap: var(--ui-space-3);
	}

	.create {
		display: flex;
		gap: var(--ui-space-2);
		margin-left: auto;
	}

	.create :global(.create-input) {
		width: calc(var(--ui-space-4) * 14);
	}

	.create-error {
		color: var(--ui-danger);
		font-size: var(--ui-fs-sm);
	}
</style>
