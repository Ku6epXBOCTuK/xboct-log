<script lang="ts">
	import AttachmentItem from "#lib/components/attachments/AttachmentItem.svelte";
	import AttachmentList from "#lib/components/attachments/AttachmentList.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type { AttachmentEntry } from "#lib/tasks/attachments.ts";

	interface Props {
		items: AttachmentEntry[];
		busy?: boolean;
		failure?: string | null;
		failed?: boolean;
		empty?: string;
		onremove: (key: string) => void;
		onmove?: (key: string) => void;
		onretry?: () => void;
	}

	let {
		items,
		busy = false,
		failure = null,
		failed = false,
		empty = "No files",
		onremove,
		onmove,
		onretry,
	}: Props = $props();
</script>

<ErrorNote message={failure} />

{#if failed}
	<p class="attachments-status">
		The attachments are unavailable
		{#if onretry !== undefined}
			<button type="button" class="attachments-retry" onclick={onretry}>
				Try again
			</button>
		{/if}
	</p>
{:else if items.length === 0}
	<p class="attachments-status">{empty}</p>
{:else}
	<AttachmentList>
		{#each items as entry (entry.key)}
			<AttachmentItem
				{entry}
				{busy}
				onremove={() => onremove(entry.key)}
				onmove={onmove === undefined ? undefined : () => onmove(entry.key)}
			/>
		{/each}
	</AttachmentList>
{/if}

<style>
	.attachments-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.attachments-retry {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text-secondary);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		cursor: pointer;
	}

	.attachments-retry:hover {
		color: var(--foreground);
		background: var(--hover);
	}
</style>
