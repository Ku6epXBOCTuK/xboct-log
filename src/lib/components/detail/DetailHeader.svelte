<script lang="ts">
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import {
		CLOSED_REASON_LABELS,
		STATUS_LABELS,
		formatDateTime,
	} from "#lib/tasks/display.ts";
	import type { Task } from "#lib/types.ts";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import Clock3 from "~icons/lucide/clock-3";
	import MessageSquare from "~icons/lucide/message-square";
	import X from "~icons/lucide/x";

	interface Props {
		task: Task;
		saving: boolean;
		failure: string | null;
		onhistory: () => void;
		oncomments: () => void;
		onclose: () => void;
	}

	let { task, saving, failure, onhistory, oncomments, onclose }: Props =
		$props();

	function stamp(): string {
		return task.closed_at != null
			? formatDateTime(task.closed_at)
			: formatDateTime(task.updated_at);
	}
</script>

<div class="detail-head">
	<div class="detail-top">
		<div class="detail-id">
			<span class="detail-id-badge">
				<span class="epic-badge">{task.id}</span>
				<CopyButton
					size="sm"
					text={task.id}
					label="Copy task id"
					title="Copy task id"
				/>
			</span>
			<StatusDot status={task.status} />
			<span>{STATUS_LABELS[task.status]}</span>
			{#if task.closed_reason !== null}
				<span class="muted">{CLOSED_REASON_LABELS[task.closed_reason]}</span>
			{/if}
			<span class="muted">{saving ? "saving…" : stamp()}</span>
		</div>
		<div class="detail-actions">
			<IconButton label="Task history" title="Task history" onclick={onhistory}>
				<Clock3 />
			</IconButton>
			<IconButton
				label="Task comments"
				title="Task comments"
				onclick={oncomments}
			>
				<MessageSquare />
			</IconButton>
			<IconButton label="Close task details" onclick={onclose}>
				<X />
			</IconButton>
		</div>
	</div>
	<ErrorNote message={failure} />
</div>

<style>
	.detail-head {
		flex: none;
		padding: var(--edge-pad) var(--edge-pad) 0;
	}

	.detail-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
	}

	.detail-id {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.detail-id-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		flex: none;
		margin-right: var(--space-2);
	}

	.detail-id-badge :global(.epic-badge) {
		margin-left: 0;
	}

	.detail-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex: none;
	}

	.muted {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
</style>
