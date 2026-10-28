<script lang="ts">
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import type { Snippet } from "svelte";
	import X from "~icons/lucide/x";

	interface Props {
		label: string;
		active: boolean;
		onreset: () => void;
		children: Snippet;
	}

	let { label, active, onreset, children }: Props = $props();
</script>

<div class="filter-block" class:active>
	<div class="filter-control" class:active>
		{@render children()}
	</div>
	<IconButton
		label={`Reset ${label} filter`}
		onclick={onreset}
		class="reset-button"
	>
		<X />
	</IconButton>
</div>

<style>
	.filter-block {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.filter-control {
		border-radius: var(--radius);
		min-width: 0;
	}

	.filter-control.active {
		outline: 1px solid var(--accent);
		outline-offset: 2px;
	}

	.filter-block :global(.reset-button) {
		visibility: hidden;
	}

	.filter-block.active :global(.reset-button) {
		visibility: visible;
	}
</style>
