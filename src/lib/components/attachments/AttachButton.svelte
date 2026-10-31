<script lang="ts">
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import Paperclip from "~icons/lucide/paperclip";
	import Upload from "~icons/lucide/upload";

	interface Props {
		count: number;
		fresh?: boolean;
		busy?: boolean;
		onpick: () => void;
		icon?: "paperclip" | "upload";
		size?: "sm" | "md" | "lg";
	}

	let {
		count,
		fresh = false,
		busy = false,
		onpick,
		icon = "paperclip",
		size = "md",
	}: Props = $props();

	const label = $derived(
		count === 0 ? "Attach a file" : `Attach a file, ${count} attached`,
	);
</script>

<span class="attach-button" class:is-fresh={fresh}>
	<IconButton {label} title={label} {size} disabled={busy} onclick={onpick}>
		{#if icon === "upload"}
			<Upload />
		{:else}
			<Paperclip />
		{/if}
	</IconButton>
	{#if count > 0}
		<span class="attach-badge" class:is-fresh={fresh}>{count}</span>
	{/if}
</span>

<style>
	.attach-button {
		position: relative;
		display: inline-flex;
		flex: none;
	}

	.attach-button.is-fresh :global(.ui-icon-button) {
		background: color-mix(in oklch, var(--accent) 22%, transparent);
		color: var(--accent-ink);
	}

	.attach-badge {
		position: absolute;
		top: -0.2rem;
		right: -0.2rem;
		display: grid;
		place-items: center;
		min-width: 1rem;
		height: 1rem;
		padding: 0 0.2rem;
		border-radius: 999px;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 0.625rem;
		font-weight: 700;
		line-height: 1;
		pointer-events: none;
	}

	.attach-badge.is-fresh {
		animation: attach-pop 700ms ease-out;
	}

	@keyframes attach-pop {
		0% {
			transform: scale(0.6);
			box-shadow: 0 0 0 0 color-mix(in oklch, var(--accent) 55%, transparent);
		}

		45% {
			transform: scale(1.3);
		}

		100% {
			transform: scale(1);
			box-shadow: 0 0 0 0.4rem transparent;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.attach-badge.is-fresh {
			animation: none;
		}
	}
</style>
