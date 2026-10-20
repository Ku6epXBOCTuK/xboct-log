<script lang="ts">
	import CommentForm from "#lib/components/detail/CommentForm.svelte";
	import CommentList from "#lib/components/detail/CommentList.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import {
		addComment,
		deleteComment,
		editComment,
	} from "#lib/remote/comments.remote.ts";
	import type { CommentsStore } from "#lib/state/comments.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import type { Comment } from "#lib/types.ts";

	interface Props {
		taskId: string;
		comments: CommentsStore;
	}

	let { taskId, comments }: Props = $props();

	let items = $derived(comments.items(taskId));
	let draft = $state("");
	let editingId = $state<string | null>(null);
	let failure = $state<string | null>(null);
	let busy = $state(false);

	$effect(() => {
		void comments.load(taskId).catch((error) => {
			failure = messageOf(error);
		});
	});

	async function run(work: () => Promise<void>) {
		busy = true;
		failure = null;
		try {
			await work();
			await comments.load(taskId);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			busy = false;
		}
	}

	function submit() {
		const body = draft.trim();
		if (body === "") return;
		draft = "";
		void run(async () => {
			const created = await addComment({ task_id: taskId, body });
			comments.apply(created);
		});
	}

	function startEdit(comment: Comment) {
		editingId = comment.id;
	}

	function cancelEdit() {
		editingId = null;
	}

	function saveEdit(id: string, body: string) {
		if (body === "") return;
		editingId = null;
		void run(async () => {
			const updated = await editComment({ id, body });
			comments.apply(updated);
		});
	}

	function remove(comment: Comment) {
		void run(async () => {
			const deleted = await deleteComment({ id: comment.id });
			comments.remove(taskId, deleted.id);
		});
	}
</script>

<section class="comments" aria-label="Comments">
	<div class="comments-head">
		<span class="comments-title">Comments</span>
		<span class="muted">{items.length}</span>
	</div>
	<ErrorNote message={failure} />
	<CommentList
		{items}
		{editingId}
		{busy}
		onstartedit={startEdit}
		onsave={saveEdit}
		oncancel={cancelEdit}
		onremove={remove}
	/>
	<CommentForm bind:value={draft} {busy} onsubmit={submit} />
</section>

<style>
	.comments {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}

	.comments-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.comments-title {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
</style>
