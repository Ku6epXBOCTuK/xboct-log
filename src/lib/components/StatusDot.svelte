<script lang="ts">
	import type { Status } from "#lib/tasks/mocks.ts";

	interface Props {
		status: Status;
	}

	let { status }: Props = $props();
</script>

<span class={`status-dot ${status.replace(" ", "-")}`} aria-hidden="true">
</span>
