<script lang="ts">
	import type { PlanStatus } from "#lib/api/plans.ts";

	interface Props {
		status: PlanStatus;
	}

	let { status }: Props = $props();
</script>

<span class="status-dot {status}" aria-hidden="true"></span>

<style>
	.status-dot {
		display: inline-block;
		flex: none;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--status-backlog);
	}

	.status-dot.active {
		background: var(--status-active);
	}

	.status-dot.done {
		background: var(--status-done);
	}

	.status-dot.cancelled {
		background: var(--status-cancelled);
	}
</style>
