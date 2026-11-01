<script lang="ts">
	import MarkdownEditor from "#lib/components/markdown/MarkdownEditor.svelte";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import { useTaskEditorSlot } from "#lib/state/task-editor.ts";
	import { untrack } from "svelte";

	const slot = useTaskEditorSlot();
	const editor = $derived(slot.current);

	let text = $state(untrack(() => editor.value.description));
	let dirty = false;
	let shownTask: string | undefined;

	$effect(() => {
		const taskId = editor.taskId;
		if (taskId === undefined || taskId === shownTask) return;
		shownTask = taskId;
		dirty = false;
	});

	// NOTE: the parent may replace the description without a blur (form reset),
	// so a clean draft follows the value instead of outliving it.
	$effect(() => {
		const current = editor.value.description;
		untrack(() => {
			if (dirty || text === current) return;
			text = current;
		});
	});

	function commit() {
		if (!dirty) return;
		dirty = false;
		const patch = { description: text };
		if (editor.ondraft !== undefined) {
			editor.ondraft(patch);
			return;
		}
		editor.onfield(patch);
	}

	function insertDescription(next: string) {
		text = next;
		dirty = false;
		editor.oncanceldraft?.();
		editor.onfield({ description: next });
	}
</script>

{#snippet extraActions()}
	{#if editor.editing}
		<CopyButton {text} label="Copy description" title="Copy description" />
	{/if}
	{#if editor.commentsCount !== undefined}
		<button
			class="comments-count"
			type="button"
			onclick={() => editor.oncomments?.()}
			disabled={editor.oncomments === undefined}
		>
			{editor.commentsCount}
			{editor.commentsCount === 1 ? "comment" : "comments"}
		</button>
	{/if}
{/snippet}

<div class="description detail-field">
	<MarkdownEditor
		bind:value={text}
		label="Description"
		placeholder="Description"
		repo={editor.repo}
		target={editor.taskId}
		height="20rem"
		resizable
		actions={extraActions}
		oninput={() => (dirty = true)}
		oninsert={insertDescription}
		onfocus={() => editor.oncanceldraft?.()}
		onblur={commit}
	/>
</div>

<style>
	.description {
		color: var(--text-secondary);
		font-size: var(--text-md);
	}

	.comments-count {
		margin-left: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		min-height: 1.5rem;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.comments-count:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--foreground);
	}
</style>
