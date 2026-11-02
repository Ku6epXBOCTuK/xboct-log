<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import ControlRow from "@ku6epxboctuk/ui-kit/components/ControlRow.svelte";
	import { useTaskPanel } from "#lib/state/task-panel.ts";
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import {
		CLOSED_REASONS,
		STATUS_BY_REASON,
		type ClosedReason,
	} from "#lib/types.ts";
	import { CLOSED_REASON_LABELS, STATUS_LABELS } from "#lib/tasks/display.ts";

	const panel = useTaskPanel();
	const closed = $derived(panel.task.closed_at !== null);

	let reason = $state<ClosedReason>("fixed");
	let confirming = $state(false);
</script>

<div class="detail-actions">
	<ControlRow>
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
				onclick={() => panel.closeTask(reason)}
				disabled={panel.saving}
			>
				Close task
			</Button>
		{:else}
			<Button onclick={panel.reopen} disabled={panel.saving}>Reopen</Button>
		{/if}
		{#snippet end()}
			{#if confirming}
				<Button variant="danger" onclick={panel.remove} disabled={panel.saving}>
					Confirm delete
				</Button>
				<Button onclick={() => (confirming = false)}>Cancel</Button>
			{:else}
				<Button
					variant="ghost"
					class="danger"
					onclick={() => (confirming = true)}
				>
					Delete
				</Button>
			{/if}
		{/snippet}
	</ControlRow>
</div>

<style>
	.detail-actions {
		flex: none;
		padding: var(--space-4) var(--edge-pad) var(--edge-pad);
		border-top: 1px solid var(--border);
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
