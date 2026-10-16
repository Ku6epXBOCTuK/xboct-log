<script lang="ts">
	import type { Task } from "#lib/types.ts";
	import ChevronDown from "~icons/lucide/chevron-down";
	import FolderKanban from "~icons/lucide/folder-kanban";

	interface Props {
		value: string;
		epics: Task[];
		countEpic: (epicId: string) => number;
		onselect: (value: string) => void;
	}

	let { value, epics, countEpic, onselect }: Props = $props();
</script>

<label class="select-filter">
	<FolderKanban />
	<select
		{value}
		onchange={(event) => onselect(event.currentTarget.value)}
		aria-label="Filter by epic"
	>
		<option value="any">Epic: any</option>
		<option value="none">Epic: none</option>
		{#each epics as epic (epic.id)}
			<option value={epic.id}>
				{epic.id} — {epic.title} ({countEpic(epic.id)})
			</option>
		{/each}
	</select>
	<ChevronDown />
</label>
