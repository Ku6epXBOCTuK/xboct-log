<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import ControlRow from "@ku6epxboctuk/ui-kit/components/ControlRow.svelte";
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import { useTaskPanel } from "#lib/state/task-panel.ts";
	import { CLOSED_REASON_LABELS, STATUS_LABELS } from "#lib/tasks/display.ts";
	import {
		CLOSED_REASONS,
		type ClosedReason,
		STATUS_BY_REASON,
	} from "#lib/types.ts";

	const panel = useTaskPanel();
	const closed = $derived(panel.task.closed_at !== null);
	const openChildren = $derived(
		panel.epicProgress === null
			? 0
			: panel.epicProgress.total - panel.epicProgress.closed,
	);

	let reason = $state<ClosedReason>("fixed");
	let confirming = $state(false);
	let confirmFor = $state<string | null>(null);
	const confirmingClose = $derived(confirmFor === panel.task.id);

	function requestClose() {
		if (openChildren > 0 && !confirmingClose) {
			confirmFor = panel.task.id;
			return;
		}
		panel.closeTask(reason);
	}
</script>

<div class="detail-actions">
	{#if confirmingClose}
		<p class="close-warning" role="alert">
			{openChildren}
			of {panel.epicProgress?.total ?? 0} tasks are still open. Closing the epic
			marks it done before its tasks are finished.
		</p>
	{/if}
	<ControlRow>
		{#if !closed}
			{#if confirmingClose}
				<Button
					variant="danger"
					onclick={() => panel.closeTask(reason)}
					disabled={panel.saving}
				>
					Close anyway
				</Button>
				<Button onclick={() => (confirmFor = null)}>Cancel</Button>
			{:else}
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
					onclick={requestClose}
					disabled={panel.saving}
				>
					Close task
				</Button>
			{/if}
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

	.close-warning {
		margin: 0 0 var(--space-2);
		color: var(--warning);
	}

	:global(.ui-button.danger) {
		color: var(--accent-ink);
	}

	:global(.ui-button.danger:hover:not(:disabled)) {
		background: var(--danger-surface);
	}
</style>
