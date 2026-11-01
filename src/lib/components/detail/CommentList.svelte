<script lang="ts">
	import CommentItem from "#lib/components/detail/CommentItem.svelte";
	import { provideCommentRow } from "#lib/state/comment-row.ts";
	import type { Comment } from "#lib/types.ts";

	interface Props {
		items: Comment[];
		repo?: string | null;
		editingId: string | null;
		busy: boolean;
		onstartedit: (comment: Comment) => void;
		onsave: (id: string, body: string) => void;
		oncancel: () => void;
		onremove: (comment: Comment) => void;
	}

	let {
		items,
		repo = null,
		editingId,
		busy,
		onstartedit,
		onsave,
		oncancel,
		onremove,
	}: Props = $props();

	provideCommentRow({
		get busy() {
			return busy;
		},
		isEditing: (id) => editingId === id,
		startEdit: (id) => {
			const comment = items.find((item) => item.id === id);
			if (comment !== undefined) onstartedit(comment);
		},
		save: (id, body) => onsave(id, body),
		cancel: () => oncancel(),
		remove: (id) => {
			const comment = items.find((item) => item.id === id);
			if (comment !== undefined) onremove(comment);
		},
	});
</script>

{#if items.length === 0}
	<p class="comments-empty">No comments yet</p>
{:else}
	<ul class="comment-list">
		{#each items as comment (comment.id)}
			<CommentItem {comment} {repo} />
		{/each}
	</ul>
{/if}

<style>
	.comments-empty {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.comment-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
