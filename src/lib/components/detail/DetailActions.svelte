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
			<label class="close-reason">
				Close reason
				<select bind:value={reason} aria-label="Close reason">
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
