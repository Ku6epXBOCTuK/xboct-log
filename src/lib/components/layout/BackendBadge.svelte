<script lang="ts">
	import InfoPopover from "@ku6epxboctuk/ui-kit/components/InfoPopover.svelte";
	import { useBoard } from "#lib/state/board.svelte.ts";

	const { health } = useBoard();

	const label = $derived(
		health.state === "online"
			? "Connected"
			: health.state === "offline"
				? "Offline"
				: "Checking...",
	);

	const detail = $derived(
		health.lastOkAt === null
			? "The backend has not answered yet"
			: `The backend answered at ${new Date(health.lastOkAt).toLocaleTimeString()}`,
	);
</script>

<InfoPopover
	label={`Backend: ${label}. ${detail}`}
	class="backend-badge"
	onclick={() => void health.check()}
>
	{#snippet icon()}
		<span
			class="dot"
			class:online={health.state === "online"}
			class:offline={health.state === "offline"}
			class:pulsing={health.state !== "online"}
			aria-hidden="true"
		></span>
	{/snippet}
	{#snippet content()}
		<div class="popover">
			<div class="state">{label}</div>
			<div class="detail">{detail}</div>
			<div class="hint">Click the dot to check again</div>
		</div>
	{/snippet}
</InfoPopover>

<style>
	:global(.ui-info-popover-trigger.backend-badge) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--control-h);
		height: var(--control-h);
		padding: 0;
		border-radius: 999px;
		cursor: pointer;
	}

	:global(.ui-info-popover-trigger.backend-badge:hover) {
		background: color-mix(in oklch, var(--foreground) 10%, transparent);
	}

	.dot {
		display: block;
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 50%;
		background: var(--text-muted);
		--pulse: var(--text-muted);
	}

	.dot.online {
		background: var(--green);
	}

	.dot.offline {
		background: var(--accent);
		--pulse: var(--accent);
	}

	.dot.pulsing {
		animation: backend-pulse 1.4s ease-in-out infinite;
	}

	@keyframes backend-pulse {
		0%,
		100% {
			transform: scale(1);
			box-shadow: 0 0 0 0 color-mix(in oklch, var(--pulse) 55%, transparent);
		}

		45% {
			transform: scale(1.24);
			box-shadow: 0 0 0 0.35rem transparent;
		}
	}

	.popover {
		display: grid;
		gap: 0.15rem;
	}

	.state {
		color: var(--foreground);
		font-weight: 600;
	}

	.detail,
	.hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	@media (prefers-reduced-motion: reduce) {
		.dot.pulsing {
			animation: none;
		}
	}
</style>
