<script lang="ts">
	import CommentEditor from "#lib/components/detail/CommentEditor.svelte";
	import MarkdownView from "#lib/components/markdown/MarkdownView.svelte";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import { formatDateTime } from "#lib/tasks/display.ts";
	import { useCommentRow } from "#lib/state/comment-row.ts";
	import type { Comment } from "#lib/types.ts";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import Button from "@ku6epxboctuk/ui-kit/components/Button";
	import Code from "~icons/lucide/code";
	import Eye from "~icons/lucide/eye";
	import Pencil from "~icons/lucide/pencil";
	import Trash2 from "~icons/lucide/trash-2";

	interface Props {
		comment: Comment;
		repo?: string | null;
	}

	let { comment, repo = null }: Props = $props();

	const row = useCommentRow();
	const editing = $derived(row.isEditing(comment.id));

	let raw = $state(false);
	let confirming = $state(false);
</script>

<li class="comment">
	<div class="comment-meta">
		<span>{formatDateTime(comment.created_at)}</span>
		{#if comment.edited_at !== null}
			<span class="edited">edited</span>
		{/if}
		{#if !editing}
			<div class="comment-tools">
				{#if confirming}
					<span class="confirm-label">Delete comment?</span>
					<Button
						size="sm"
						variant="danger"
						disabled={row.busy}
						onclick={() => {
							confirming = false;
							row.remove(comment.id);
						}}
					>
						Delete
					</Button>
					<Button size="sm" onclick={() => (confirming = false)}>Cancel</Button>
				{:else}
					<IconButton
						label={raw ? "Show preview" : "Show raw markdown"}
						title={raw ? "Show preview" : "Show raw markdown"}
						size="sm"
						active={raw}
						onclick={() => (raw = !raw)}
					>
						{#if raw}
							<Eye />
						{:else}
							<Code />
						{/if}
					</IconButton>
					<CopyButton text={comment.body} label="Copy comment" size="sm" />
					<IconButton
						label="Edit comment"
						title="Edit comment"
						size="sm"
						onclick={() => row.startEdit(comment.id)}
					>
						<Pencil />
					</IconButton>
					<IconButton
						label="Delete comment"
						title="Delete comment"
						variant="danger"
						size="sm"
						disabled={row.busy}
						onclick={() => (confirming = true)}
					>
						<Trash2 />
					</IconButton>
				{/if}
			</div>
		{/if}
	</div>
	{#if editing}
		<CommentEditor
			body={comment.body}
			{repo}
			busy={row.busy}
			onsave={(body) => row.save(comment.id, body)}
			oncancel={row.cancel}
		/>
	{:else}
		<div class="comment-body">
			{#if raw}
				<pre class="comment-raw">{comment.body}</pre>
			{:else}
				<MarkdownView text={comment.body} {repo} />
			{/if}
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
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--border);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.comment-tools {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.confirm-label {
		color: var(--text-secondary);
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
		min-width: 0;
	}

	.comment-raw {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
