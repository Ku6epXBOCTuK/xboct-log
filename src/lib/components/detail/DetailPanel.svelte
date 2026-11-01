<script lang="ts">
	import DetailPanelBody from "#lib/components/detail/DetailPanelBody.svelte";
	import type { Task } from "#lib/types.ts";

	interface Props {
		selected: Task | null;
		onclear: () => void;
		ondelete?: (id: string) => void;
		oncreatechild?: (task: Task) => void;
		onmoved?: (id: string) => void;
	}

	let { selected, onclear, ondelete, oncreatechild, onmoved }: Props = $props();
</script>

{#if selected !== null}
	<DetailPanelBody
		task={selected}
		{onclear}
		{ondelete}
		{oncreatechild}
		{onmoved}
	/>
{/if}
