<script lang="ts">
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import Modal from "@ku6epxboctuk/ui-kit/components/Modal";
	import { messageOf } from "#lib/tasks/display.ts";
	import { scopeNameError } from "#lib/tasks/scopes.ts";

	interface Props {
		open: boolean;
		oncreate: (name: string) => Promise<unknown>;
		onclose: () => void;
	}

	let { open, oncreate, onclose }: Props = $props();

	let name = $state("");
	let failure = $state<string | null>(null);
	let saving = $state(false);
	let nameInput: HTMLInputElement | undefined = $state();
	let wasOpen = false;

	$effect(() => {
		if (open && !wasOpen) {
			wasOpen = true;
			name = "";
			failure = null;
			return;
		}
		if (!open) wasOpen = false;
	});

	$effect(() => {
		if (open && nameInput !== undefined) nameInput.focus();
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const clean = name.trim();
		const invalid = scopeNameError(clean);
		if (invalid !== null) {
			failure = invalid;
			return;
		}

		saving = true;
		failure = null;
		try {
			await oncreate(clean);
			onclose();
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}
</script>

<Modal {open} title="New scope" {onclose}>
	<form class="scope-create" onsubmit={submit}>
		<label class="field">
			Name
			<input
				bind:this={nameInput}
				class="field-control"
				value={name}
				placeholder="Backend"
				aria-label="Scope name"
				oninput={(event) => (name = event.currentTarget.value)}
			/>
			<span class="hint">Scopes group the tasks of the project.</span>
		</label>

		<ErrorNote message={failure} />

		<div class="actions">
			<button class="new-task" type="submit" disabled={saving}>
				{saving ? "creating…" : "Create"}
			</button>
			<button class="icon-button" type="button" onclick={onclose}>
				Cancel
			</button>
		</div>
	</form>
</Modal>

<style>
	.scope-create {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 400;
		line-height: 1.5;
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.actions button {
		flex: 1;
		justify-content: center;
	}
</style>
