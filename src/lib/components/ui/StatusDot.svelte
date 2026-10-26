<script lang="ts">
	import type { Status } from "#lib/types.ts";

	interface Props {
		status: Status;
	}

	let { status }: Props = $props();
</script>

<span class={`status-dot ${status.replace(" ", "-")}`} aria-hidden="true">
</span>

<style>
	.status-dot {
		width: 0.5625rem;
		height: 0.5625rem;
		border-radius: 50%;
		display: inline-block;
		background: var(--status-open);
		flex: 0 0 auto;
	}

	.status-dot.backlog {
		background: var(--status-backlog);
	}

	.status-dot.in-progress {
		background: var(--status-in-progress);
	}

	.status-dot.blocked {
		background: var(--status-blocked);
	}

	.status-dot.done {
		background: var(--status-done);
	}

	.status-dot.cancelled {
		background: var(--status-cancelled);
	}
</style>
