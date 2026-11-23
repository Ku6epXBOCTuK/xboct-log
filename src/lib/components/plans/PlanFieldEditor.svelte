<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TextArea from "@ku6epxboctuk/ui-kit/components/TextArea.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";
	import type { PlanField } from "#lib/state/plans.svelte.ts";
	import { onMount } from "svelte";

	interface Props {
		field: PlanField;
		draft: string;
		saving: boolean;
		failed: boolean;
		oninput: (value: string) => void;
		onsave: () => void;
		ondiscard: () => void;
	}

	let { field, draft, saving, failed, oninput, onsave, ondiscard }: Props =
		$props();

	const CONFIG: Record<
		PlanField,
		{ label: string; placeholder: string; error: string; maxlength?: number }
	> = {
		key: {
			label: "Plan id",
			placeholder: "PL-1",
			error: "Use a free PL-NUMBER id",
			maxlength: 20,
		},
		name: {
			label: "Plan name",
			placeholder: "Plan name",
			error: "Enter a plan name",
		},
		description: {
			label: "Plan description",
			placeholder: "Plan description",
			error: "Could not save the description",
		},
	};

	const config = $derived(CONFIG[field]);
	const empty = $derived(field !== "description" && draft.trim() === "");
	const multiline = $derived(field === "description");

	let textInput = $state<HTMLInputElement>();
	let textArea = $state<HTMLTextAreaElement>();

	onMount(() => {
		const element = textInput ?? textArea;
		element?.focus();
		element?.select();
	});

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		if (!empty && !saving) onsave();
	}

	function keydown(event: KeyboardEvent): void {
		if (event.key === "Escape") {
			event.preventDefault();
			if (!saving) ondiscard();
			return;
		}
		if (
			event.key !== "Enter" ||
			(multiline && !event.ctrlKey && !event.metaKey)
		)
			return;
		if (empty || saving) return;
		event.preventDefault();
		onsave();
	}
</script>

<form class="field-edit" onsubmit={submit}>
	{#if multiline}
		<TextArea
			bind:element={textArea}
			aria-label={config.label}
			placeholder={config.placeholder}
			value={draft}
			rows={4}
			disabled={saving}
			oninput={(event) => oninput(event.currentTarget.value)}
			onkeydown={keydown}
		/>
	{:else}
		<TextInput
			bind:element={textInput}
			aria-label={config.label}
			placeholder={config.placeholder}
			maxlength={config.maxlength}
			value={draft}
			disabled={saving}
			oninput={(event) => oninput(event.currentTarget.value)}
			onkeydown={keydown}
		/>
	{/if}
	<div class="field-actions">
		<Button variant="primary" type="submit" disabled={empty || saving}>
			Save
		</Button>
		<Button type="button" disabled={saving} onclick={ondiscard}>Cancel</Button>
	</div>
	{#if failed}
		<p class="item-error">{config.error}</p>
	{/if}
</form>

<style>
	.field-edit {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-2);
		min-width: 0;
	}

	.field-actions {
		display: flex;
		align-items: center;
		gap: var(--ui-space-2);
	}

	.item-error {
		margin: 0;
		color: var(--ui-danger);
		font-size: var(--ui-fs-sm);
	}
</style>
