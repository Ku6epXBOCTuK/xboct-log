<script lang="ts">
	import PanelOverlay from "#lib/components/detail/PanelOverlay.svelte";
	import TaskComments from "#lib/components/detail/TaskComments.svelte";
	import MarkdownView from "#lib/components/markdown/MarkdownView.svelte";
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import type { CommentsStore } from "#lib/state/comments.svelte.ts";
	import { STATUS_LABELS } from "#lib/tasks/display.ts";
	import type { Task } from "#lib/types.ts";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import RefreshCw from "~icons/lucide/refresh-cw";

	interface Props {
		task: Task;
		comments: CommentsStore;
		repo?: string | null;
		onback: () => void;
		onclose: () => void;
	}

	let { task, comments, repo = null, onback, onclose }: Props = $props();
</script>

<PanelOverlay title="Comments" label="Task comments" {onback} {onclose}>
	{#snippet actions()}
		<IconButton
			label="Reload comments"
			title="Reload comments"
			onclick={() => {
				void comments.load(task.id).catch(() => {});
			}}
		>
			<RefreshCw />
		</IconButton>
	{/snippet}
	<div class="task-summary">
		<div class="summary-title">{task.title}</div>
		<div class="summary-meta">
			<span class="epic-badge">{task.id}</span>
			<StatusDot status={task.status} />
			<span>{STATUS_LABELS[task.status]}</span>
		</div>
		{#if task.description.trim() !== ""}
			<div class="summary-description">
				<MarkdownView text={task.description} {repo} />
			</div>
		{/if}
	</div>
	<TaskComments taskId={task.id} {comments} />
</PanelOverlay>

<style>
	.task-summary {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--border);
	}

	.summary-title {
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.3;
	}

	.summary-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.summary-description {
		margin: 0;
	}
</style>
