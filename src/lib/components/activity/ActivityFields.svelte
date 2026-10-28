<script lang="ts">
	import ActivityChanges from "#lib/components/activity/ActivityChanges.svelte";
	import { activityFieldLabel } from "#lib/activity/labels.ts";
	import type { ActivityChange } from "#lib/types.ts";
	import Badge from "@ku6epxboctuk/ui-kit/components/Badge";

	interface Props {
		changes: ActivityChange[];
		fields: string[];
	}

	let { changes, fields }: Props = $props();
</script>

{#if changes.length > 0}
	<ActivityChanges {changes} />
{:else if fields.length > 0}
	<Badge variant="outline" size="xs">{activityFieldLabel(fields[0])}</Badge>
	{#each fields.slice(1) as field (field)}
		<Badge variant="outline" size="xs">{activityFieldLabel(field)}</Badge>
	{/each}
{:else}
	—
{/if}
