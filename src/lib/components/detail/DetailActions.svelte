<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button";
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import {
		CLOSED_REASONS,
		STATUS_BY_REASON,
		type ClosedReason,
	} from "#lib/types.ts";
	import { CLOSED_REASON_LABELS, STATUS_LABELS } from "#lib/tasks/display.ts";

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
			<div class="field close-reason">
				Close reason
				<SingleSelect
					items={[...CLOSED_REASONS]}
					value={reason}
					getKey={(option) => option}
					getLabel={(option) =>
						`${CLOSED_REASON_LABELS[option]} → ${STATUS_LABELS[STATUS_BY_REASON[option]]}`}
					onselect={(option) => (reason = option)}
					variant="field"
					ariaLabel="Close reason"
				/>
			</div>
			<Button
				variant="primary"
				onclick={() => onclose(reason)}
				disabled={saving}
			>
				Close task
			</Button>
		{:else}
			<Button onclick={onreopen} disabled={saving}>Reopen</Button>
		{/if}
	</div>
	<div class="action-group">
		{#if confirming}
			<Button onclick={() => (confirming = false)}>Cancel</Button>
			<Button variant="danger" onclick={ondelete} disabled={saving}>
				Confirm delete
			</Button>
		{:else}
			<Button
				variant="ghost"
				class="danger"
				onclick={() => (confirming = true)}
			>
				Delete
			</Button>
		{/if}
	</div>
</div>

<style>
	.detail-actions {
		display: flex;
		align-items: flex-end;
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

	.action-group:first-child {
		flex: 1 1 auto;
	}

	.action-group:last-child {
		flex: none;
		justify-content: flex-end;
	}

	.close-reason {
		flex: 0 1 14rem;
		min-width: 0;
	}

	:global(.ui-button.danger) {
		color: var(--accent-ink);
	}

	:global(.ui-button.danger:hover:not(:disabled)) {
		background: var(--danger-surface);
	}
</style>
