<script lang="ts">
	import type { DocumentStatus } from "#lib/api/plans/documents.ts";

	interface Props {
		value: DocumentStatus;
		statuses: DocumentStatus[];
		onchange: (status: DocumentStatus) => void;
	}

	let { value, statuses, onchange }: Props = $props();
</script>

<select
	aria-label="Document status"
	{value}
	onchange={(event) => onchange(event.currentTarget.value as DocumentStatus)}
>
	{#each statuses as status (status)}
		<option value={status}>{status}</option>
	{/each}
</select>

<style>
	select {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}
</style>
