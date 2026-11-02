<script lang="ts">
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton.svelte";
	import Check from "~icons/lucide/check";
	import X from "~icons/lucide/x";
	import { onMount, untrack } from "svelte";

	interface Props {
		name: string;
		busy?: boolean;
		onsave: (value: string) => void;
		ondiscard: () => void;
	}

	let { name, busy = false, onsave, ondiscard }: Props = $props();

	// NOTE: the field is mounted on demand, so the first name is the only one
	let draft = $state(untrack(() => name));
	let field = $state<HTMLSpanElement | null>(null);
	let input = $state<HTMLInputElement | null>(null);

	onMount(() => {
		input?.focus();
		input?.select();
	});

	function save() {
		const clean = draft.trim().toLowerCase();
		if (clean === "" || clean === name) {
			ondiscard();
			return;
		}
		onsave(clean);
	}

	function handleBlur(event: FocusEvent & { currentTarget: HTMLInputElement }) {
		const next = event.relatedTarget;
		if (next instanceof Node && field?.contains(next)) return;
		ondiscard();
	}
</script>

<span class="tag-edit" bind:this={field}>
	<input
		bind:this={input}
		bind:value={draft}
		aria-label={`Rename ${name}`}
		title="Press Enter to save, Escape to cancel"
		maxlength={20}
		disabled={busy}
		onkeydown={(event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				save();
			}
			if (event.key === "Escape") {
				event.preventDefault();
				ondiscard();
			}
		}}
		onblur={handleBlur}
	/>
	<IconButton
		label="Save"
		title="Save the new name"
		size="sm"
		class="save"
		disabled={busy}
		onclick={save}
	>
		<Check />
	</IconButton>
	<IconButton
		label="Cancel"
		title="Discard the change"
		size="sm"
		class="cancel"
		onclick={ondiscard}
	>
		<X />
	</IconButton>
</span>

<style>
	.tag-edit {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1 1 auto;
		min-width: 0;
	}

	.tag-edit input {
		min-width: 0;
		flex: 1 1 auto;
		border: 1px solid var(--accent);
		background: var(--field);
		color: var(--foreground);
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-md);
		font-weight: 500;
		outline: none;
	}

	.tag-edit :global(.ui-icon-button.save) {
		color: var(--accent);
	}

	.tag-edit :global(.ui-icon-button.cancel) {
		color: var(--text-muted);
	}
</style>
