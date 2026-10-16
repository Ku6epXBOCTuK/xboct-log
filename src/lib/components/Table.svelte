<script lang="ts">
	import type { Task } from "#lib/tasks/mocks.ts";
	import SlidersHorizontal from "./SlidersHorizontal.svelte";
	import StatusDot from "./ui/StatusDot.svelte";

	interface Props {
		filteredTasks: Task[];
		selected: Task | null;
	}

	let { filteredTasks, selected = $bindable() }: Props = $props();

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
			{#each filteredTasks as task (task.id)}
				<tr
					onclick={() => setSelected(task)}
					class={selected?.id === task.id ? "row-selected" : ""}
				>
					<td class="task-id">{task.id}</td>
					<td class="task-title">
						<span class="new-badge">
							{task.status === "backlog" ? "new" : "active"}
						</span>
						{task.title}
						{#if task.id === "SHOP-26"}
							<span class="epic-badge">SHOP-13</span>
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
							{task.status}
						</span>
					</td>
					<td class={`priority-label ${task.priority} optional-column`}>
						{task.priority}
					</td>
					<td class="date-label optional-column">{task.date}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if filteredTasks.length === 0}
		<div class="empty-state">
			<SlidersHorizontal />
			<p>No tasks match these filters.</p>
			<button onclick={clearFilters}>Reset filters</button>
		</div>
	{/if}
</div>
