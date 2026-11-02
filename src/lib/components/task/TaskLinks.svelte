<script lang="ts">
	import SectionDivider from "#lib/components/ui/SectionDivider.svelte";
	import TaskSelect from "#lib/components/ui/select/TaskSelect.svelte";
	import { useTaskEditorSlot } from "#lib/state/task-editor.ts";
	import Chip from "@ku6epxboctuk/ui-kit/components/Chip.svelte";

	const slot = useTaskEditorSlot();
	const editor = $derived(slot.current);

	let linksOpen = $state(false);
</script>

<SectionDivider title="Links" bind:open={linksOpen}>
	{#snippet actions()}
		{#if editor.canMarkBlocked}
			<button
				type="button"
				class="links-hint"
				disabled={editor.busy}
				onclick={() => editor.onmarkblocked?.()}
			>
				mark blocked
			</button>
		{/if}
	{/snippet}
	<div class="detail-grid">
		<div class="field">
			Blocked by
			<TaskSelect
				items={editor.blockerCandidates}
				value={editor.linkFields.blocked_by}
				onadd={(id) => editor.onlinkadd("blocked_by", id)}
				onremove={(id) => editor.onlinkremove("blocked_by", id)}
				href={editor.linkHref}
				onlink={editor.onlinkopen}
				onsearch={editor.onlinksearch}
				unavailable={editor.linkUnavailable}
				placeholder="Add blocker"
				ariaLabel="Blocked by"
			/>
		</div>
		<div class="field">
			Blocks
			<div class="block-field">
				{#if editor.linkFields.blocks.length === 0}
					<span class="block-empty">none</span>
				{:else}
					{#each editor.linkFields.blocks as id (id)}
						{@const hint = editor.linkUnavailable?.(id) ?? null}
						{@const target =
							hint === null ? (editor.linkHref?.(id) ?? null) : null}
						<Chip unavailable={hint !== null} hint={hint ?? undefined}>
							{#if target !== null}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href comes from taskHref(), which resolves the task route -->
								<a href={target} onclick={() => editor.onlinkopen?.(id)}
									>{id}</a
								>
							{:else}
								{id}
							{/if}
						</Chip>
					{/each}
				{/if}
			</div>
		</div>
		<div class="field field-wide">
			Relates to
			<TaskSelect
				items={editor.linkCandidates}
				value={editor.linkFields.relates_to}
				onadd={(id) => editor.onlinkadd("relates_to", id)}
				onremove={(id) => editor.onlinkremove("relates_to", id)}
				href={editor.linkHref}
				onlink={editor.onlinkopen}
				onsearch={editor.onlinksearch}
				unavailable={editor.linkUnavailable}
				placeholder="Add related task"
				ariaLabel="Relates to"
			/>
		</div>
		<div class="field">
			Duplicates
			<TaskSelect
				items={editor.linkCandidates}
				value={editor.linkFields.duplicates}
				onadd={(id) => editor.onlinkadd("duplicates", id)}
				onremove={(id) => editor.onlinkremove("duplicates", id)}
				href={editor.linkHref}
				onlink={editor.onlinkopen}
				onsearch={editor.onlinksearch}
				unavailable={editor.linkUnavailable}
				placeholder="Add duplicate of"
				ariaLabel="Duplicates"
			/>
		</div>
		<div class="field">
			Duplicated by
			<TaskSelect
				items={editor.linkCandidates}
				value={editor.linkFields.duplicated_by}
				onadd={(id) => editor.onlinkadd("duplicated_by", id)}
				onremove={(id) => editor.onlinkremove("duplicated_by", id)}
				href={editor.linkHref}
				onlink={editor.onlinkopen}
				onsearch={editor.onlinksearch}
				unavailable={editor.linkUnavailable}
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
</style>
