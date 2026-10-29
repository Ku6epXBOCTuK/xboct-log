<script lang="ts">
	import SectionDivider from "#lib/components/ui/SectionDivider.svelte";
	import TaskSelect from "#lib/components/ui/select/TaskSelect.svelte";
	import type { LinkField } from "#lib/tasks/links.ts";
	import type { Task } from "#lib/types.ts";

	interface Props {
		blockedBy: string[];
		blocks: string[];
		relatesTo: string[];
		duplicates: string[];
		duplicatedBy: string[];
		candidates: Task[];
		blockerCandidates: Task[];
		onadd: (field: LinkField, id: string) => void;
		onremove: (field: LinkField, id: string) => void;
		onopen?: (id: string) => void;
		onsearch?: (query: string) => void;
		unavailable?: (id: string) => string | null;
		canMarkBlocked?: boolean;
		busy?: boolean;
		onmarkblocked?: () => void;
	}

	let {
		blockedBy,
		blocks,
		relatesTo,
		duplicates,
		duplicatedBy,
		candidates,
		blockerCandidates,
		onadd,
		onremove,
		onopen,
		onsearch,
		unavailable,
		canMarkBlocked = false,
		busy = false,
		onmarkblocked,
	}: Props = $props();

	let linksOpen = $state(false);
</script>

<SectionDivider title="Links" bind:open={linksOpen}>
	{#snippet actions()}
		{#if canMarkBlocked}
			<button
				type="button"
				class="links-hint"
				disabled={busy}
				onclick={() => onmarkblocked?.()}
			>
				mark blocked
			</button>
		{/if}
	{/snippet}
	<div class="detail-grid">
		<div class="field">
			Blocked by
			<TaskSelect
				items={blockerCandidates}
				value={blockedBy}
				onadd={(id) => onadd("blocked_by", id)}
				onremove={(id) => onremove("blocked_by", id)}
				{onopen}
				{onsearch}
				{unavailable}
				placeholder="Add blocker"
				ariaLabel="Blocked by"
			/>
		</div>
		<div class="field">
			Blocks
			<div class="block-field">
				{#if blocks.length === 0}
					<span class="block-empty">none</span>
				{:else}
					{#each blocks as id (id)}
						{@const hint = unavailable?.(id) ?? null}
						{#if hint === null}
							<button
								type="button"
								class="block-chip"
								aria-label={`Open ${id}`}
								onclick={() => onopen?.(id)}
							>
								{id}
							</button>
						{:else}
							<span
								class="block-chip is-unavailable"
								title={hint}
								aria-disabled="true"
							>
								{id}
							</span>
						{/if}
					{/each}
				{/if}
			</div>
		</div>
		<div class="field field-wide">
			Relates to
			<TaskSelect
				items={candidates}
				value={relatesTo}
				onadd={(id) => onadd("relates_to", id)}
				onremove={(id) => onremove("relates_to", id)}
				{onopen}
				{onsearch}
				{unavailable}
				placeholder="Add related task"
				ariaLabel="Relates to"
			/>
		</div>
		<div class="field">
			Duplicates
			<TaskSelect
				items={candidates}
				value={duplicates}
				onadd={(id) => onadd("duplicates", id)}
				onremove={(id) => onremove("duplicates", id)}
				{onopen}
				{onsearch}
				{unavailable}
				placeholder="Add duplicate of"
				ariaLabel="Duplicates"
			/>
		</div>
		<div class="field">
			Duplicated by
			<TaskSelect
				items={candidates}
				value={duplicatedBy}
				onadd={(id) => onadd("duplicated_by", id)}
				onremove={(id) => onremove("duplicated_by", id)}
				{onopen}
				{onsearch}
				{unavailable}
				placeholder="Add duplicate source"
				ariaLabel="Duplicated by"
			/>
		</div>
	</div>
</SectionDivider>

<style>
	.links-hint {
		border: 0;
		background: transparent;
		color: var(--accent-ink);
		font-family: inherit;
		font-size: var(--text-xs);
		cursor: pointer;
	}

	.links-hint:hover {
		color: var(--foreground);
	}

	.links-hint:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.field-wide {
		grid-column: 1 / -1;
	}

	.block-field {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		width: 100%;
		min-height: var(--control-h);
		padding: var(--space-1) var(--space-2);
		border: 2px solid var(--border);
		border-radius: var(--radius);
		background: var(--field);
	}

	.block-empty {
		color: var(--text-muted);
		font-size: var(--text-md);
		font-weight: 400;
	}

	.block-chip {
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		background: var(--panel);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 400;
		line-height: 1.75;
		cursor: pointer;
	}

	.block-chip:hover {
		color: var(--foreground);
		border-color: var(--accent);
	}

	.block-chip.is-unavailable,
	.block-chip.is-unavailable:hover {
		border-style: dashed;
		border-color: var(--border-strong);
		color: var(--text-muted);
		cursor: not-allowed;
	}
</style>
