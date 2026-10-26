<script lang="ts">
	import ActivityChanges from "#lib/components/activity/ActivityChanges.svelte";
	import { activityFieldLabel } from "#lib/activity/labels.ts";
	import type { ActivityChange } from "#lib/types.ts";

	interface Props {
		changes: ActivityChange[];
		fields: string[];
	}

	let { changes, fields }: Props = $props();
</script>

{#if changes.length > 0}
	<ActivityChanges {changes} />
{:else if fields.length > 0}
	<span class="field-chip">{activityFieldLabel(fields[0])}</span>
	{#each fields.slice(1) as field (field)}
		<span class="field-chip">{activityFieldLabel(field)}</span>
	{/each}
{:else}
	—
{/if}

<style>
	.field-chip {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--field);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		white-space: nowrap;
	}
</style>
