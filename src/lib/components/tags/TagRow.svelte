<script lang="ts">
	import type { TagInventoryEntry } from "#lib/state/tags.svelte.ts";
	import TagEditField from "#lib/components/tags/TagEditField.svelte";
	import Badge from "@ku6epxboctuk/ui-kit/components/Badge";
	import Button from "@ku6epxboctuk/ui-kit/components/Button";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import Archive from "~icons/lucide/archive";
	import ArchiveRestore from "~icons/lucide/archive-restore";
	import Pencil from "~icons/lucide/pencil";

	interface Props {
		entry: TagInventoryEntry;
		busy?: boolean;
		editing?: boolean;
		onstartedit: () => void;
		onsave: (value: string) => void;
		ondiscard: () => void;
		onarchive: (archived: boolean) => void;
	}

	let {
		entry,
		busy = false,
		editing = false,
		onstartedit,
		onsave,
		ondiscard,
		onarchive,
	}: Props = $props();

	const archiveTitle = $derived(
		entry.count > 0
			? `Hide from suggestions, stays on the ${entry.count} tasks that carry it`
			: "Hide from suggestions, no task carries it",
	);
</script>

<li class="tag-row" class:is-archived={entry.archived}>
	<div class="tag-name">
		{#if editing}
			<TagEditField name={entry.name} {busy} {onsave} {ondiscard} />
		{:else}
			<span class="name">{entry.name}</span>
			<IconButton
				label={`Rename ${entry.name}`}
				title="Rename the tag"
				size="sm"
				class="edit"
				onclick={onstartedit}
			>
				<Pencil />
			</IconButton>
		{/if}
		{#if entry.archived}
			<Badge tone="neutral" variant="outline">archived</Badge>
		{/if}
	</div>
	<span class="tag-active">{entry.active}<span class="unit"> active</span></span
	>
	<span class="tag-all">{entry.count}<span class="unit"> all</span></span>
	<span class="tag-action">
		{#if entry.archived}
			<Button
				variant="ghost"
				size="sm"
				disabled={busy}
				title="Put the tag back into suggestions"
				onclick={() => onarchive(false)}
			>
				{#snippet icon()}<ArchiveRestore />{/snippet}
				Restore
			</Button>
		{:else}
			<Button
				variant="ghost"
				size="sm"
				disabled={busy}
				title={archiveTitle}
				onclick={() => onarchive(true)}
			>
				{#snippet icon()}<Archive />{/snippet}
				Archive
			</Button>
		{/if}
	</span>
</li>

<style>
	.tag-row {
		display: grid;
		grid-template-columns: var(--tag-cols, minmax(0, 1fr) 5rem 4rem 6.5rem);
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-2);
		border-bottom: 1px solid var(--border);
	}

	.tag-row:hover {
		background: var(--hover);
	}

	.tag-name {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.tag-name .name {
		min-width: 0;
		flex: 1 1 auto;
		padding: var(--space-1) var(--space-2);
		font-size: var(--text-md);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tag-name :global(.ui-icon-button.edit) {
		opacity: 0;
	}

	.tag-row:hover .tag-name :global(.ui-icon-button.edit),
	.tag-name :global(.ui-icon-button.edit:focus-visible) {
		opacity: 1;
	}

	.tag-row.is-archived .tag-name .name {
		color: var(--text-muted);
	}

	.tag-active,
	.tag-all {
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		text-align: right;
		white-space: nowrap;
	}

	.tag-all {
		color: var(--text-muted);
	}

	.unit {
		display: none;
	}

	.tag-action {
		justify-self: end;
	}

	@media (max-width: 820px) {
		.tag-row {
			row-gap: var(--space-1);
		}

		.unit {
			display: inline;
		}

		.tag-active {
			grid-area: 2 / 1 / 3 / 2;
			text-align: left;
		}

		.tag-all {
			grid-area: 2 / 2 / 3 / 3;
		}

		.tag-action {
			grid-area: 1 / 3 / 3 / 4;
			align-self: center;
		}
	}
</style>
