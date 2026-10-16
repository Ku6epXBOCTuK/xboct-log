<script lang="ts">
	import { STATUS_LABELS, formatDate } from "#lib/tasks/display.ts";
	import type { Task } from "#lib/types.ts";
	import SlidersHorizontal from "./SlidersHorizontal.svelte";
	import StatusDot from "./ui/StatusDot.svelte";

	interface Props {
		tasks: Task[];
		selected: Task | null;
	}

	let { tasks, selected = $bindable() }: Props = $props();

	function setSelected(task: Task) {
		selected = task;
	}

	function clearFilters() {}
</script>

<div class="table-wrap">
	<table>
		<thead>
			<tr>
				<th class="id-col">ID</th>
				<th>Task</th>
				<th class="optional-column">Tags</th>
				<th>Status</th>
				<th class="optional-column">Priority</th>
				<th class="date-col optional-column">
					Created <span>↓</span>
				</th>
			</tr>
		</thead>
		<tbody>
			{#each tasks as task (task.id)}
				<tr
					onclick={() => setSelected(task)}
					class={selected?.id === task.id ? "row-selected" : ""}
				>
					<td class="task-id">{task.id}</td>
					<td class="task-title">
						<span class="new-badge">
							{task.status === "open" ? "new" : "active"}
						</span>
						{task.title}
						{#if task.epic_id !== null}
							<span class="epic-badge">{task.epic_id}</span>
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
					<td class="date-label optional-column"
						>{formatDate(task.created_at)}</td
					>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if tasks.length === 0}
		<div class="empty-state">
			<SlidersHorizontal />
			<p>No tasks match these filters.</p>
			<button onclick={clearFilters}>Reset filters</button>
		</div>
	{/if}
</div>
