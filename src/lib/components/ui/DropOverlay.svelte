<script lang="ts">
	import Upload from "~icons/lucide/upload";

	interface Props {
		z?: number;
	}

	let { z = 10 }: Props = $props();
</script>

<div class="drop-overlay" style:z-index={z} aria-hidden="true">
	<Upload />
	<span>Drop files to attach</span>
</div>

<style>
	.drop-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		border: 2px dashed var(--accent);
		border-radius: var(--radius);
		background: color-mix(in oklch, var(--panel) 82%, transparent);
		color: var(--text-secondary);
		font-size: var(--text-lg);
		font-weight: 600;
		pointer-events: none;
	}

	.drop-overlay :global(svg) {
		width: 2rem;
		height: 2rem;
		color: var(--accent);
	}
</style>
