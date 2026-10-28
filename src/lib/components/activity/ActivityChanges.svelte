<script lang="ts">
	import {
		activityFieldLabel,
		activityValueLabel,
	} from "#lib/activity/labels.ts";
	import type { ActivityChange } from "#lib/types.ts";
	import Badge from "@ku6epxboctuk/ui-kit/components/Badge";

	interface Props {
		changes: ActivityChange[];
	}

	let { changes }: Props = $props();
</script>

<ul class="changes">
	{#each changes as change (change.field)}
		<li>
			<Badge variant="outline" size="xs"
				>{activityFieldLabel(change.field)}</Badge
			>
			<span class="value">{activityValueLabel(change.from)}</span>
			<span class="arrow">→</span>
			<span class="value">{activityValueLabel(change.to)}</span>
		</li>
	{/each}
</ul>

<style>
	.changes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-wrap: wrap;
		font-size: var(--text-xs);
	}

	.value {
		color: var(--text-secondary);
		overflow-wrap: anywhere;
	}

	.arrow {
		color: var(--text-muted);
	}
</style>
