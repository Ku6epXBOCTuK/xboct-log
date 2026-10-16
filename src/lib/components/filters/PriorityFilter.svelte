<script lang="ts">
	import { PRIORITIES, type Priority } from "#lib/types.ts";

	interface Props {
		value: Priority | "all";
		onselect: (value: Priority | "all") => void;
	}

	let { value, onselect }: Props = $props();
</script>

<div class="filter-group priority-group">
	<span class="filter-label">Priority</span>
	{#each PRIORITIES as option (option)}
		<button
			onclick={() => onselect(value === option ? "all" : option)}
			class={`filter-chip priority-${option} ${value === option ? "active" : ""}`}
		>
			{option}
		</button>
	{/each}
</div>
