<script lang="ts">
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
		<button
			class="new-task"
			onclick={onsubmit}
			disabled={busy || value.trim() === ""}
		>
			Add comment
		</button>
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
