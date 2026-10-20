<script lang="ts">
	import { createBackup } from "#lib/remote/backup.remote.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import CircleCheck from "~icons/lucide/circle-check";
	import CircleX from "~icons/lucide/circle-x";
	import DatabaseBackup from "~icons/lucide/database-backup";
	import LoaderCircle from "~icons/lucide/loader-circle";

	type Phase = "idle" | "busy" | "done" | "error";

	const RESET_MS = 10_000;

	let phase = $state<Phase>("idle");
	let detail = $state("");
	let timer: ReturnType<typeof setTimeout> | undefined;

	const status = $derived(
		phase === "done"
			? "Backup done"
			: phase === "error"
				? "Backup failed"
				: phase === "busy"
					? "Backing up..."
					: "",
	);

	function settle(next: "done" | "error", message: string) {
		phase = next;
		detail = message;
		clearTimeout(timer);
		timer = setTimeout(() => {
			phase = "idle";
			detail = "";
		}, RESET_MS);
	}

	async function run() {
		if (phase !== "idle") return;
		phase = "busy";
		detail = "";
		try {
			const result = await createBackup({});
			settle("done", result.path);
		} catch (error) {
			settle("error", messageOf(error));
		}
	}
</script>

<div class="backup-control">
	<p
		class="backup-status"
		class:done={phase === "done"}
		class:error={phase === "error"}
		title={detail}
	>
		{status}
	</p>
	<button
		class="backup-button"
		class:done={phase === "done"}
		class:error={phase === "error"}
		type="button"
		onclick={run}
		disabled={phase !== "idle"}
		title={detail}
	>
		{#if phase === "busy"}
			<span class="spin"><LoaderCircle /></span>
		{:else if phase === "done"}
			<CircleCheck />
		{:else if phase === "error"}
			<CircleX />
		{:else}
			<DatabaseBackup />
		{/if}
		<span>Back up now</span>
	</button>
</div>

<style>
	.backup-control {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.backup-status {
		margin: 0;
		height: 1rem;
		line-height: 1rem;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.backup-status.done {
		color: var(--green-ink);
	}

	.backup-status.error {
		color: var(--accent-ink);
	}

	.backup-button {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--panel);
		color: var(--text-secondary);
		padding: var(--space-2) var(--space-3);
		min-height: var(--control-h);
		font-size: var(--text-sm);
		font-weight: 500;
	}

	.backup-button:hover:not(:disabled) {
		color: var(--foreground);
		background: var(--hover);
	}

	.backup-button:disabled {
		cursor: not-allowed;
	}

	.backup-button:disabled:not(.done):not(.error) {
		opacity: 0.6;
		cursor: progress;
	}

	.backup-button.done {
		border-color: var(--green);
		background: var(--green-surface);
		color: var(--green-ink);
	}

	.backup-button.error {
		border-color: var(--accent);
		background: var(--danger-surface);
		color: var(--accent-ink);
	}

	.backup-button.done:disabled,
	.backup-button.error:disabled {
		opacity: 1;
	}

	.backup-button :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: none;
	}

	.spin {
		display: inline-flex;
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 820px) {
		.backup-control {
			display: none;
		}
	}
</style>
