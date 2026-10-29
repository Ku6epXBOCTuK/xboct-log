<script lang="ts">
	import type { BackupItem, RestoreOutcome } from "#lib/remote/contracts.ts";
	import BackupRestorePanel from "./BackupRestorePanel.svelte";
	import BackupRow from "./BackupRow.svelte";

	interface Props {
		items: BackupItem[];
		onrestored: (outcome: RestoreOutcome) => void;
		onerror: (message: string) => void;
	}

	let { items, onrestored, onerror }: Props = $props();

	let selected = $state("");

	const keyOf = (item: BackupItem) => `${item.kind}/${item.name}`;

	function select(item: BackupItem) {
		const key = keyOf(item);
		selected = selected === key ? "" : key;
	}
</script>

<ul class="list">
	{#each items as item (keyOf(item))}
		<BackupRow
			{item}
			open={selected === keyOf(item)}
			onselect={() => select(item)}
		>
			{#if selected === keyOf(item)}
				<BackupRestorePanel
					{item}
					{onrestored}
					{onerror}
					oncancel={() => (selected = "")}
				/>
			{/if}
		</BackupRow>
	{/each}
</ul>

<style>
	.list {
		margin: 0;
		padding: 0 var(--edge-pad) var(--edge-pad);
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
</style>
