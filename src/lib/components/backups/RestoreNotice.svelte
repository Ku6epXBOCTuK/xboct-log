<script lang="ts">
	import type { RestoreOutcome } from "#lib/remote/contracts.ts";

	interface Props {
		outcome: RestoreOutcome;
		ondismiss: () => void;
	}

	let { outcome, ondismiss }: Props = $props();
</script>

<div class="result">
	<p>
		Restored {outcome.snapshot.tasks} tasks from {outcome.snapshot.projects}
		projects.
	</p>
	<p class="path">
		The database it replaced is saved as {outcome.safetyPath}.
	</p>
	<button type="button" onclick={ondismiss}>Dismiss</button>
</div>

<style>
	.result {
		margin: 0 var(--edge-pad) var(--space-3);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		border: 1px solid var(--green);
		border-radius: var(--radius);
		background: var(--green-surface);
		color: var(--green-ink);
		font-size: var(--text-sm);
	}

	.result p {
		margin: 0;
	}

	.result .path {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		overflow-wrap: anywhere;
	}

	.result button {
		align-self: flex-start;
		margin-top: var(--space-1);
		border: 1px solid currentColor;
		border-radius: var(--radius);
		background: transparent;
		color: inherit;
		padding: var(--space-1) var(--space-3);
		font: inherit;
		cursor: pointer;
	}
</style>
