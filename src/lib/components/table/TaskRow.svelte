<script lang="ts">
	import BlockedBadge from "#lib/components/table/BlockedBadge.svelte";
	import BlockingBadge from "#lib/components/table/BlockingBadge.svelte";
	import EpicBadge from "#lib/components/table/EpicBadge.svelte";
	import InfoPopover from "#lib/components/ui/InfoPopover.svelte";
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { STATUS_LABELS, formatDate } from "#lib/tasks/display.ts";
	import type { EpicProgress } from "#lib/tasks/filter.ts";
	import { CLOSED_STATUSES, type Scope, type Task } from "#lib/types.ts";
	import Badge from "@ku6epxboctuk/ui-kit/components/Badge";
	import Chip from "@ku6epxboctuk/ui-kit/components/Chip";
	import type { Snippet } from "svelte";
	import Paperclip from "~icons/lucide/paperclip";

	interface Props {
		task: Task;
		scoped: boolean;
		scope: Scope | null;
		projectName: string;
		showProject: boolean;
		isselected: boolean;
		progress: EpicProgress | null;
		blockers: string[];
		blocking: string[];
		onselect?: () => void;
		onepic?: (id: string) => void;
		action?: Snippet<[Task]>;
	}

	let {
		task,
		scoped,
		scope,
		projectName,
		showProject,
		isselected,
		progress,
		blockers,
		blocking,
		onselect,
		onepic,
		action,
	}: Props = $props();

	const today = new Date().toISOString().slice(0, 10);

	const overdue = $derived(
		task.due_at !== null &&
			task.due_at < today &&
			!CLOSED_STATUSES.includes(task.status),
	);

	function filterEpic(epicId: string | null) {
		if (epicId !== null) {
			onepic?.(epicId);
		}
	}
</script>

<tr
	onclick={onselect}
	class:interactive={onselect !== undefined}
	class={isselected ? "row-selected" : ""}
	data-task-id={task.id}
	aria-current={isselected ? "true" : undefined}
>
	<td class="task-id">{task.id}</td>
	{#if showProject}
		<td class="project-label optional-column">{projectName}</td>
	{/if}
	<td class="scope-cell optional-column">
		{#if scope !== null}
			<Badge variant="outline" size="xs">{scope.name}</Badge>
		{:else if scoped}
			<Badge variant="outline" size="xs" class="scope-missing">no scope</Badge>
		{/if}
	</td>
	<td class="task-title">
		<div class="title-row">
			<span class="task-title-text" title={task.title}>{task.title}</span>
			{#if task.is_epic}
				<EpicBadge
					id={task.id}
					{progress}
					onfilter={(target) => onepic?.(target)}
				/>
			{:else if task.epic_id !== null}
				<InfoPopover
					text="Show tasks of this epic"
					class="epic-badge epic-filter"
					onclick={() => filterEpic(task.epic_id)}
				>
					{task.epic_id}
				</InfoPopover>
			{/if}
			{#if task.status === "blocked"}
				<BlockedBadge {blockers} reason={task.blocked_reason ?? null} />
			{/if}
			<BlockingBadge blocked={blocking} />
		</div>
	</td>
	<td class="attach-cell optional-column">
		{#if (task.attachments_count ?? 0) > 0}
			<InfoPopover text="Attached files" class="attach-icon">
				{#snippet icon()}
					<Paperclip />
				{/snippet}
				{task.attachments_count ?? 0}
			</InfoPopover>
		{/if}
	</td>
	<td
		class="tags-cell optional-column"
		title={task.tags.map((tag) => `#${tag}`).join(" ")}
	>
		<div class="tag-list">
			{#each task.tags as tag (tag)}
				<Chip>#{tag}</Chip>
			{/each}
		</div>
	</td>
	<td>
		<span class="status-label">
			<StatusDot status={task.status} />
			{STATUS_LABELS[task.status]}
		</span>
	</td>
	<td class={`priority-label ${task.priority} optional-column`}>
		{task.priority}
	</td>
	<td class="estimate-label optional-column">
		{task.estimate ?? ""}
	</td>
	<td class="date-label optional-column">
		{formatDate(task.created_at)}
	</td>
	<td class={`due-label optional-column ${overdue ? "due-overdue" : ""}`}>
		{task.due_at ? formatDate(task.due_at) : ""}
	</td>
	<td class="date-label optional-column">
		{task.closed_at ? formatDate(task.closed_at) : ""}
	</td>
	{#if action}
		<td class="action-cell">
			{@render action(task)}
		</td>
	{/if}
</tr>

<style>
	td {
		padding: var(--space-3);
		border-bottom: 1px solid var(--border);
		color: var(--text-secondary);
		font-size: var(--text-md);
		vertical-align: middle;
	}

	tr.interactive {
		cursor: pointer;
	}

	tr:not(.row-selected):hover td {
		background: var(--hover);
	}

	.row-selected td {
		background: var(--violet-row);
	}

	.row-selected td:first-child {
		box-shadow: inset 3px 0 var(--violet);
	}

	.row-selected .task-id {
		color: var(--violet-ink);
		font-weight: 600;
	}

	.row-selected:hover td {
		background: color-mix(in oklch, var(--violet-row) 88%, var(--violet));
	}

	.task-id {
		padding-left: var(--space-6);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		overflow: hidden;
	}

	.task-title {
		color: var(--foreground);
		overflow: hidden;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		overflow: hidden;
	}

	.task-title-text {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.title-row :global(.info-popover-trigger.epic-filter) {
		padding: var(--space-1) var(--space-2);
		margin-left: var(--space-2);
		border: 0;
		background: var(--green-surface);
		color: var(--green-ink);
		cursor: pointer;
		line-height: 1.25;
	}

	.title-row :global(.info-popover-trigger.epic-filter:hover) {
		background: color-mix(in oklch, var(--green) 28%, var(--green-surface));
	}

	:global(.ui-badge.scope-missing) {
		border-style: dashed;
	}

	.scope-cell {
		overflow: hidden;
	}

	.tags-cell {
		overflow: hidden;
	}

	.attach-cell {
		text-align: center;
	}

	.tag-list {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
		row-gap: var(--space-1);
		overflow: hidden;
	}

	.status-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
	}

	.priority-label {
		text-transform: lowercase;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
	}

	.priority-label.critical {
		color: var(--priority-critical);
		font-weight: 600;
	}

	.priority-label.high {
		color: var(--priority-high);
		font-weight: 600;
	}

	.date-label {
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		font-variant-numeric: tabular-nums;
	}

	.estimate-label {
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.action-cell {
		text-align: right;
		white-space: nowrap;
	}

	.project-label {
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.due-overdue {
		color: var(--priority-critical);
		font-weight: 600;
	}

	@media (max-width: 1100px) {
		td {
			padding-inline: var(--space-2);
		}

		.task-id {
			padding-left: var(--space-4);
		}
	}
</style>
