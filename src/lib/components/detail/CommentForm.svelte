<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button";

	interface Props {
		value: string;
		busy: boolean;
		onsubmit: () => void;
	}

	let { value = $bindable(""), busy, onsubmit }: Props = $props();
</script>

<div class="comment-form">
	<textarea
		class="field-control"
		bind:value
		rows="3"
		placeholder="Add a comment…"
		aria-label="New comment"></textarea>
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
