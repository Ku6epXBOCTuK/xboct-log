<script lang="ts">
	import MarkdownEditor from "#lib/components/markdown/MarkdownEditor.svelte";
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";

	interface Props {
		value: string;
		repo?: string | null;
		busy: boolean;
		onsubmit: () => void;
	}

	let { value = $bindable(""), repo = null, busy, onsubmit }: Props = $props();
</script>

<div class="comment-form">
	<MarkdownEditor
		bind:value
		label="New comment"
		placeholder="Add a comment…"
		{repo}
		height="6rem"
	/>
	<div class="comment-actions">
		<Button
			variant="primary"
			onclick={onsubmit}
			disabled={busy || value.trim() === ""}
		>
			Add comment
		</Button>
	</div>
</div>

<style>
	.comment-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.comment-actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
	}
</style>
