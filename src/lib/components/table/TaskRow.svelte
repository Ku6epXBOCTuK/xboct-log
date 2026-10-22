<script lang="ts">
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { STATUS_LABELS, formatDate } from "#lib/tasks/display.ts";
	import type { EpicProgress } from "#lib/tasks/filter.ts";
	import { CLOSED_STATUSES, type Scope, type Task } from "#lib/types.ts";
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
		onselect,
		onepic,
		action,
	}: Props = $props();

	const epicEmpty = $derived(progress === null || progress.total === 0);

	const today = new Date().toISOString().slice(0, 10);

	const overdue = $derived(
		task.due_at !== null &&
			task.due_at < today &&
			!CLOSED_STATUSES.includes(task.status),
	);

	function filterEpic(event: MouseEvent, epicId: string | null) {
		event.stopPropagation();
		if (epicId !== null) {
			onepic?.(epicId);
		}
	}
</script>

<tr
	onclick={onselect}
	class:interactive={onselect !== undefined}
	class={isselected ? "row-selected" : ""}
>
	<td class="task-id">{task.id}</td>
	{#if showProject}
		<td class="project-label optional-column">{projectName}</td>
	{/if}
	<td class="scope-cell optional-column">
		{#if scope !== null}
			<span class="scope-badge">{scope.name}</span>
		{:else if scoped}
			<span class="scope-badge scope-missing">no scope</span>
		{/if}
	</td>
	<td class="task-title">
		<div class="title-row">
			<span class="task-title-text" title={task.title}>{task.title}</span>
			{#if task.is_epic}
				<button
					class={`epic-badge epic-marker${epicEmpty ? " epic-marker-empty" : ""}`}
					title={epicEmpty ? "No tasks yet" : "Show tasks of this epic"}
					onclick={(event) => filterEpic(event, task.id)}
				>
					EPIC
				</button>
				{#if progress !== null && progress.total > 0}
					<span class="epic-progress"
						>{progress.closed}/{progress.total} closed</span
					>
				{/if}
			{:else if task.epic_id !== null}
				<button
					class="epic-badge epic-filter"
					title="Show tasks of this epic"
					onclick={(event) => filterEpic(event, task.epic_id)}
				>
					{task.epic_id}
				</button>
			{/if}
			{#if blockers.length > 0}
				<span class="blocker-badge" title={`Blocked by ${blockers.join(", ")}`}>
					blocked by {blockers.join(", ")}
				</span>
			{/if}
		</div>
	</td>
	<td class="attach-cell optional-column">
		{#if (task.attachments_count ?? 0) > 0}
			<span class="attach-icon" title="Attached files">
				<Paperclip />
				{task.attachments_count}
			</span>
		{/if}
	</td>
	<td
		class="tags-cell optional-column"
		title={task.tags.map((tag) => `#${tag}`).join(" ")}
	>
		<div class="tag-list">
			{#each task.tags as tag (tag)}
				<span class="tag">
					#{tag}
				</span>
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

	.epic-filter {
		border: 0;
		background: var(--green-surface);
		color: var(--green-ink);
		cursor: pointer;
		font-family: var(--font-mono);
		flex: none;
	}

	.epic-filter:hover {
		background: color-mix(in oklch, var(--green) 28%, var(--green-surface));
	}

	.epic-marker {
		border: 0;
		background: var(--violet);
		color: var(--on-violet);
		cursor: pointer;
		font-family: var(--font-mono);
		font-weight: 600;
		letter-spacing: 0.04em;
		flex: none;
	}

	.epic-marker:hover {
		background: color-mix(in oklch, var(--violet) 78%, var(--violet-ink));
	}

	.epic-marker-empty {
		border: 1px solid color-mix(in oklch, var(--violet) 45%, transparent);
		background: transparent;
		color: var(--violet-ink);
	}

	.epic-marker-empty:hover {
		background: var(--violet-surface);
	}

	.epic-progress {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		flex: none;
	}

	.scope-badge {
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		font-size: var(--text-sm);
		line-height: 1.6;
		white-space: nowrap;
	}

	.scope-missing {
		border-color: color-mix(in oklch, var(--accent) 55%, transparent);
		color: var(--accent-ink);
	}

	.blocker-badge {
		border: 1px solid color-mix(in oklch, var(--accent) 55%, transparent);
		color: var(--accent-ink);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: 1.5;
		white-space: nowrap;
		flex: none;
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

	.attach-icon {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.attach-icon :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
	}

	.tag-list {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
		row-gap: var(--space-1);
		overflow: hidden;
	}

	.tag {
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		line-height: 1.5;
		white-space: nowrap;
		flex: none;
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
