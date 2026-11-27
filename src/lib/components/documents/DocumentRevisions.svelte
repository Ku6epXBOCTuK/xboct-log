<script lang="ts">
	import type { TextRevision } from "#lib/api/plans/documents.ts";

	interface Props {
		revisions: TextRevision[];
	}

	let { revisions }: Props = $props();
</script>

<h3>Previous versions</h3>
{#if revisions.length === 0}
	<p class="empty">No previous versions</p>
{:else}
	{#each revisions as revision (revision.id)}
		<details class="revision">
			<summary>{revision.created_at} · {revision.field}</summary>
			<pre>{revision.body}</pre>
		</details>
	{/each}
{/if}

<style>
	h3 {
		margin: var(--space-5) 0 var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
		text-transform: uppercase;
	}

	.empty {
		padding: var(--space-4) var(--edge-pad);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.revision {
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}

	.revision pre {
		white-space: pre-wrap;
	}
</style>
