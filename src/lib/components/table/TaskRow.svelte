<script lang="ts">
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { STATUS_LABELS, formatDate } from "#lib/tasks/display.ts";
	import type { Task } from "#lib/types.ts";

	interface Props {
		task: Task;
		isselected: boolean;
		onselect: () => void;
		onepic?: (id: string) => void;
	}

	let { task, isselected, onselect, onepic }: Props = $props();

	function filterEpic(event: MouseEvent, epicId: string | null) {
		event.stopPropagation();
		if (epicId !== null) {
			onepic?.(epicId);
		}
	}
</script>

<tr onclick={onselect} class={isselected ? "row-selected" : ""}>
	<td class="task-id">{task.id}</td>
	<td class="task-title">
		{task.title}
		{#if task.epic_id !== null}
			<button
				class="epic-badge epic-filter"
				title="Show tasks of this epic"
				onclick={(event) => filterEpic(event, task.epic_id)}
			>
				{task.epic_id}
			</button>
		{/if}
	</td>
	<td class="optional-column">
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
	<td class="date-label optional-column">
		{formatDate(task.created_at)}
	</td>
</tr>
