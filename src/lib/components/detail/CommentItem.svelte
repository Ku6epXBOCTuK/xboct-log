<script lang="ts">
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import { formatDateTime } from "#lib/tasks/display.ts";
	import type { Comment } from "#lib/types.ts";

	interface Props {
		comment: Comment;
		editing: boolean;
		busy: boolean;
		onstartedit: () => void;
		onsave: (body: string) => void;
		oncancel: () => void;
		onremove: () => void;
	}

	let {
		comment,
		editing,
		busy,
		onstartedit,
		onsave,
		oncancel,
		onremove,
	}: Props = $props();

	let draft = $state("");
	let wasEditing = false;

	$effect(() => {
		if (editing && !wasEditing) {
			draft = comment.body;
		}
		wasEditing = editing;
	});
</script>

<li class="comment">
	<div class="comment-meta">
		<span>{formatDateTime(comment.created_at)}</span>
		{#if comment.edited_at !== null}
			<span class="edited">edited</span>
		{/if}
		{#if !editing}
			<CopyButton text={comment.body} label="Copy comment" />
		{/if}
	</div>
	{#if editing}
		<textarea
			class="field-control edit-area"
			bind:value={draft}
			rows="3"
			aria-label="Comment text"></textarea>
		<div class="comment-actions">
			<button class="icon-button" onclick={oncancel}>Cancel</button>
			<button
				class="icon-button"
				onclick={() => onsave(draft.trim())}
				disabled={busy || draft.trim() === ""}
			>
				Save
			</button>
		</div>
	{:else}
		<p class="comment-body">{comment.body}</p>
		<div class="comment-actions">
			<button class="icon-button" onclick={onstartedit}>Edit</button>
			<button class="icon-button" onclick={onremove} disabled={busy}>
				Delete
			</button>
		</div>
	{/if}
</li>

<style>
	.comment {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}

	.comment-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.comment-meta :global(.ui-icon-button) {
		margin-left: auto;
	}

	.edited {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.comment-body {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.comment-actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
	}

	.edit-area {
		min-height: 4.5rem;
	}
</style>
