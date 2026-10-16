<script lang="ts">
	import SlidersHorizontal from "~icons/lucide/sliders-horizontal";

	interface Props {
		total: number;
		onclear?: () => void;
		onnew?: () => void;
	}

	let { total, onclear, onnew }: Props = $props();
</script>

<div class="empty-state">
	<SlidersHorizontal />
	<p>{total === 0 ? "No tasks yet." : "No tasks match these filters."}</p>
	<div class="empty-actions">
		{#if total > 0}
			<button onclick={onclear}>Reset filters</button>
		{/if}
		<button onclick={onnew}>New task</button>
	</div>
</div>
