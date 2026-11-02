<script lang="ts">
	import ToggleChip from "@ku6epxboctuk/ui-kit/components/ToggleChip.svelte";
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
		<ToggleChip
			active={value === option}
			onclick={() => onselect(value === option ? "all" : option)}
			class={`priority-${option}`}
		>
			{option}
		</ToggleChip>
	{/each}
</div>

<style>
	@media (max-width: 820px) {
		.priority-group {
			display: none;
		}
	}
</style>
