<script lang="ts">
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { taskText } from "#lib/tasks/clipboard.ts";
	import {
		CLOSED_REASON_LABELS,
		STATUS_LABELS,
		formatDateTime,
	} from "#lib/tasks/display.ts";
	import { validateTaskDraft } from "#lib/tasks/fields.ts";
	import type { Task } from "#lib/types.ts";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import Clock3 from "~icons/lucide/clock-3";
	import MessageSquare from "~icons/lucide/message-square";
	import X from "~icons/lucide/x";

	interface Props {
		task: Task;
		saving: boolean;
		failure: string | null;
		onrename: (title: string) => void;
		onerror: (message: string) => void;
		onhistory: () => void;
		oncomments: () => void;
		onclose: () => void;
		oncanceldraft: () => void;
	}

	let {
		task,
		saving,
		failure,
		onrename,
		onerror,
		onhistory,
		oncomments,
		onclose,
		oncanceldraft,
	}: Props = $props();

	function stamp(): string {
		return task.closed_at != null
			? formatDateTime(task.closed_at)
			: formatDateTime(task.updated_at);
	}

	function saveTitle(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const invalid = validateTaskDraft({ title: input.value });

		if (invalid !== null) {
			onerror(invalid);
			input.value = task.title;
			return;
		}

		onrename(input.value.trim());
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
			<CopyButton
				text={taskText(task.title, task.description)}
				label="Copy title and description"
				title="Copy title and description"
			/>
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
	<div class="title-row">
		<input
			class="title-input"
			value={task.title}
			onchange={saveTitle}
			onfocus={oncanceldraft}
			aria-label="Title"
		/>
		<CopyButton text={task.title} label="Copy title" title="Copy title" />
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

	.title-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.title-row :global(.ui-icon-button) {
		margin-top: var(--space-3);
	}

	.title-input {
		width: 100%;
		font-size: var(--text-xl);
		line-height: 1.25;
		margin: var(--space-3) 0 0;
		letter-spacing: -0.02em;
		font-weight: 600;
		color: var(--foreground);
		background: transparent;
		border: 0;
		border-bottom: 1px solid transparent;
		border-radius: 0;
		padding: 0 0 var(--space-1);
		min-height: 2.5rem;
	}

	.title-input:focus {
		border-bottom-color: var(--accent);
		box-shadow: none;
	}
</style>
