<script lang="ts">
	import CommentItem from "#lib/components/detail/CommentItem.svelte";
	import type { Comment } from "#lib/types.ts";

	interface Props {
		items: Comment[];
		editingId: string | null;
		busy: boolean;
		onstartedit: (comment: Comment) => void;
		onsave: (id: string, body: string) => void;
		oncancel: () => void;
		onremove: (comment: Comment) => void;
	}

	let {
		items,
		editingId,
		busy,
		onstartedit,
		onsave,
		oncancel,
		onremove,
	}: Props = $props();
</script>

{#if items.length === 0}
	<p class="comments-empty">No comments yet</p>
{:else}
	<ul class="comment-list">
		{#each items as comment (comment.id)}
			<CommentItem
				{comment}
				editing={editingId === comment.id}
				{busy}
				onstartedit={() => onstartedit(comment)}
				onsave={(body) => onsave(comment.id, body)}
				{oncancel}
				onremove={() => onremove(comment)}
			/>
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
