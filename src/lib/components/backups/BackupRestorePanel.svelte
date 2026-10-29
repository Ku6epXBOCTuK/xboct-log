<script lang="ts">
	import { applyBackup, inspectBackup } from "#lib/remote/backups.remote.ts";
	import type {
		BackupItem,
		RestoreOutcome,
		SnapshotInfo,
	} from "#lib/remote/contracts.ts";
	import { formatDateTime, messageOf } from "#lib/tasks/display.ts";
	import TriangleAlert from "~icons/lucide/triangle-alert";

	interface Props {
		item: BackupItem;
		onrestored: (outcome: RestoreOutcome) => void;
		onerror: (message: string) => void;
		oncancel: () => void;
	}

	let { item, onrestored, onerror, oncancel }: Props = $props();

	let inspection = $state<SnapshotInfo | null>(null);
	let inspecting = $state(true);
	let invalid = $state(false);
	let confirmed = $state(false);
	let busy = $state(false);

	$effect(() => {
		let cancelled = false;
		inspect();

		async function inspect() {
			try {
				const info = await inspectBackup({
					kind: item.kind,
					name: item.name,
				});
				if (!cancelled) inspection = info;
			} catch (cause) {
				if (cancelled) return;
				invalid = true;
				onerror(messageOf(cause));
			} finally {
				if (!cancelled) inspecting = false;
			}
		}

		return () => {
			cancelled = true;
		};
	});

	async function restore() {
		busy = true;
		try {
			onrestored(await applyBackup({ kind: item.kind, name: item.name }));
		} catch (cause) {
			onerror(messageOf(cause));
			busy = false;
		}
	}
</script>

<div class="confirm">
	<p class="warn">
		<TriangleAlert />
		<span>
			The whole database is replaced with this snapshot. Tasks, comments and
			attachments added after {formatDateTime(item.mtime)} are gone.
		</span>
	</p>
	<p class="facts">
		{#if inspecting}
			Reading the snapshot…
		{:else if invalid}
			This backup cannot be used, see the error above.
		{:else if inspection !== null}
			{inspection.tasks} tasks from {inspection.projects} projects ·
		{/if}
		{#if !invalid}
			the current database is saved into the manual folder first.
		{/if}
	</p>
	<label class="agree">
		<input
			type="checkbox"
			bind:checked={confirmed}
			disabled={inspecting || invalid || busy}
		/>
		Replace the current database
	</label>
	<div class="actions">
		<button type="button" class="cancel" disabled={busy} onclick={oncancel}>
			Cancel
		</button>
		<button
			type="button"
			class="danger"
			disabled={!confirmed || inspecting || invalid || busy}
			onclick={() => void restore()}
		>
			{busy ? "Restoring…" : "Restore this backup"}
		</button>
	</div>
</div>

<style>
	.confirm {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		border-top: 1px solid var(--border);
		font-size: var(--text-sm);
	}

	.warn {
		display: flex;
		gap: var(--space-2);
		margin: 0;
		color: var(--accent-ink);
	}

	.warn :global(svg) {
		width: 1rem;
		height: 1rem;
		flex: none;
		margin-top: 0.125rem;
	}

	.facts {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.agree {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-secondary);
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
	}

	.actions button {
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--panel);
		color: var(--text-secondary);
		padding: var(--space-1) var(--space-3);
		min-height: var(--control-h-sm);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}

	.actions button:hover:not(:disabled) {
		color: var(--foreground);
		background: var(--hover);
	}

	.actions button.danger {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--on-accent);
	}

	.actions button.danger:hover:not(:disabled) {
		background: color-mix(in oklch, var(--accent) 88%, var(--on-accent));
	}

	.actions button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
