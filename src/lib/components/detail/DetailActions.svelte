<script lang="ts">
	import {
		CLOSED_REASONS,
		STATUS_BY_REASON,
		type ClosedReason,
	} from "#lib/types.ts";

	interface Props {
		closed: boolean;
		saving: boolean;
		onclose: (reason: ClosedReason) => void;
		onreopen: () => void;
		ondelete: () => void;
	}

	let { closed, saving, onclose, onreopen, ondelete }: Props = $props();

	let reason = $state<ClosedReason>("fixed");
	let confirming = $state(false);
</script>

<div class="detail-actions">
	<div class="action-group">
		{#if !closed}
			<label class="field close-reason">
				Close reason
				<select
					class="field-control"
					bind:value={reason}
					aria-label="Close reason"
				>
					{#each CLOSED_REASONS as option (option)}
						<option value={option}>
							{option} → {STATUS_BY_REASON[option]}
						</option>
					{/each}
				</select>
			</label>
			<button
				class="new-task"
				onclick={() => onclose(reason)}
				disabled={saving}
			>
				Close
			</button>
		{:else}
			<button class="icon-button" onclick={onreopen} disabled={saving}>
				Reopen
			</button>
		{/if}
	</div>
	<div class="action-group">
		{#if confirming}
			<button class="icon-button" onclick={() => (confirming = false)}>
				Cancel
			</button>
			<button class="danger armed" onclick={ondelete} disabled={saving}>
				Confirm delete
			</button>
		{:else}
			<button class="danger" onclick={() => (confirming = true)}>
				Delete
			</button>
		{/if}
	</div>
</div>

<style>
	.detail-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		flex: none;
		padding: var(--space-4) var(--edge-pad) var(--edge-pad);
		border-top: 1px solid var(--border);
	}

	.action-group {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		min-width: 0;
	}

	.action-group:last-child {
		justify-content: flex-end;
	}

	.close-reason {
		flex: 1 1 auto;
		min-width: 0;
	}

	.danger {
		border: 1px solid color-mix(in oklch, var(--accent) 45%, transparent);
		background: transparent;
		color: var(--accent-ink);
		border-radius: var(--radius);
		padding: 0 var(--space-3);
		min-height: var(--control-h);
		font-size: var(--text-sm);
	}

	.danger:hover {
		background: var(--danger-surface);
	}

	.danger.armed {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
		font-weight: 600;
	}

	.danger.armed:hover {
		background: var(--accent);
	}
</style>
