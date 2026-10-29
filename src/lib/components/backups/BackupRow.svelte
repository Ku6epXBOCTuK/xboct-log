<script lang="ts">
	import type { BackupItem } from "#lib/remote/contracts.ts";
	import { formatSize } from "#lib/tasks/attachments.ts";
	import { formatDateTime } from "#lib/tasks/display.ts";
	import type { Snippet } from "svelte";
	import DatabaseBackup from "~icons/lucide/database-backup";
	import RotateCcw from "~icons/lucide/rotate-ccw";

	interface Props {
		item: BackupItem;
		open?: boolean;
		onselect: () => void;
		children?: Snippet;
	}

	let { item, open = false, onselect, children }: Props = $props();
</script>

<li class="row" class:open>
	<div class="summary">
		<span class="kind-icon"><DatabaseBackup /></span>
		<span class="kind">{item.kind}</span>
		<span class="date">{formatDateTime(item.mtime)}</span>
		<span class="muted">{formatSize(item.size)}</span>
		<span class="name" title={item.path}>{item.name}</span>
		<button type="button" class="restore" onclick={onselect}>
			<RotateCcw />
			Restore
		</button>
	</div>

	{@render children?.()}
</li>

<style>
	.row {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--panel);
	}

	.row.open {
		border-color: var(--border-strong);
	}

	.summary {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-sm);
	}

	.kind-icon {
		display: inline-flex;
		flex: none;
		color: var(--text-muted);
	}

	.kind-icon :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.kind {
		width: 4.5rem;
		flex: none;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.date {
		width: 11rem;
		flex: none;
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.name {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.restore {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		flex: none;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--panel);
		color: var(--text-secondary);
		padding: var(--space-1) var(--space-3);
		min-height: var(--control-h-sm);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}

	.restore:hover {
		color: var(--foreground);
		background: var(--hover);
	}

	.restore :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
	}
</style>
