<script lang="ts">
	import MarkdownEditor from "#lib/components/markdown/MarkdownEditor.svelte";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import type { TaskFieldValues, TaskPatch } from "#lib/tasks/fields.ts";
	import { untrack } from "svelte";

	interface Props {
		value: TaskFieldValues;
		taskId?: string;
		repo?: string | null;
		editing?: boolean;
		commentsCount?: number;
		oncomments?: () => void;
		onfield: (patch: TaskPatch) => void;
		ondraft?: (patch: TaskPatch) => void;
		oncanceldraft?: () => void;
	}

	let {
		value,
		taskId,
		repo = null,
		editing = false,
		commentsCount,
		oncomments,
		onfield,
		ondraft,
		oncanceldraft,
	}: Props = $props();

	let text = $state(untrack(() => value.description));
	let dirty = false;
	let shownTask: string | undefined;

	$effect(() => {
		if (taskId === undefined || taskId === shownTask) return;
		shownTask = taskId;
		dirty = false;
	});

	// NOTE: the parent may replace the description without a blur (form reset),
	// so a clean draft follows the value instead of outliving it.
	$effect(() => {
		const current = value.description;
		untrack(() => {
			if (dirty || text === current) return;
			text = current;
		});
	});

	function commit() {
		if (!dirty) return;
		dirty = false;
		const patch = { description: text };
		if (ondraft !== undefined) {
			ondraft(patch);
			return;
		}
		onfield(patch);
	}

	function insertDescription(next: string) {
		text = next;
		dirty = false;
		oncanceldraft?.();
		onfield({ description: next });
	}
</script>

{#snippet extraActions()}
	{#if editing}
		<CopyButton {text} label="Copy description" title="Copy description" />
	{/if}
	{#if commentsCount !== undefined}
		<button
			class="comments-count"
			type="button"
			onclick={() => oncomments?.()}
			disabled={oncomments === undefined}
		>
			{commentsCount}
			{commentsCount === 1 ? "comment" : "comments"}
		</button>
	{/if}
{/snippet}

<div class="description detail-field">
	<MarkdownEditor
		bind:value={text}
		label="Description"
		placeholder="Description"
		{repo}
		target={taskId}
		height="20rem"
		resizable
		actions={extraActions}
		oninput={() => (dirty = true)}
		oninsert={insertDescription}
		onfocus={() => oncanceldraft?.()}
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
