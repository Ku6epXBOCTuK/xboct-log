<script lang="ts">
	import type { Task } from "#lib/types.ts";
	import EmptyState from "./EmptyState.svelte";
	import TaskRow from "./TaskRow.svelte";

	interface Props {
		tasks: Task[];
		selected: Task | null;
		total: number;
		onclear?: () => void;
		onnew?: () => void;
		onepic?: (id: string) => void;
	}

	let {
		tasks,
		selected = $bindable(),
		total,
		onclear,
		onnew,
		onepic,
	}: Props = $props();
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
				<th class="date-col optional-column">Created</th>
			</tr>
		</thead>
		<tbody>
			{#each tasks as task (task.id)}
				<TaskRow
					{task}
					isselected={selected?.id === task.id}
					onselect={() => (selected = task)}
					{onepic}
				/>
			{/each}
		</tbody>
	</table>
	{#if tasks.length === 0}
		<EmptyState {total} {onclear} {onnew} />
	{/if}
</div>
