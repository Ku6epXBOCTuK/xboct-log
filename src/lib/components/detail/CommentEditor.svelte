<script lang="ts">
	import MarkdownEditor from "#lib/components/markdown/MarkdownEditor.svelte";
	import { untrack } from "svelte";
	import Button from "@ku6epxboctuk/ui-kit/components/Button";

	interface Props {
		body: string;
		repo?: string | null;
		busy: boolean;
		onsave: (body: string) => void;
		oncancel: () => void;
	}

	let { body, repo = null, busy, onsave, oncancel }: Props = $props();

	let draft = $state(untrack(() => body));
</script>

<div class="comment-editor">
	<MarkdownEditor
		bind:value={draft}
		label="Comment text"
		placeholder="Write a comment…"
		{repo}
		height="8rem"
	/>
	<div class="comment-actions">
		<Button onclick={oncancel}>Cancel</Button>
		<Button
			onclick={() => onsave(draft.trim())}
			disabled={busy || draft.trim() === ""}
		>
			Save
		</Button>
	</div>
</div>

<style>
	.comment-actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
		margin-top: var(--space-2);
	}
</style>
