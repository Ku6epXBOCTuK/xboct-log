<script lang="ts">
	import type { TagInventoryEntry } from "#lib/state/tags.svelte.ts";
	import TagRow from "#lib/components/tags/TagRow.svelte";

	interface Props {
		active: TagInventoryEntry[];
		archived: TagInventoryEntry[];
		query: string;
		busy: string;
		editing: string | null;
		onstartedit: (name: string) => void;
		onsave: (name: string, value: string) => void;
		ondiscard: () => void;
		onarchive: (name: string, archived: boolean) => void;
	}

	let {
		active,
		archived,
		query,
		busy,
		editing,
		onstartedit,
		onsave,
		ondiscard,
		onarchive,
	}: Props = $props();

	const searching = $derived(query.trim() !== "");
</script>

<div class="tag-table">
	<div class="tag-head" aria-hidden="true">
		<span>Tag</span>
		<span>Active</span>
		<span>All</span>
		<span></span>
	</div>

	{#if active.length === 0}
		<p class="empty">{searching ? "Nothing matches" : "No active tags"}</p>
	{:else}
		<ul class="tag-list">
			{#each active as entry (entry.name)}
				<TagRow
					{entry}
					busy={busy === entry.name}
					editing={editing === entry.name}
					onstartedit={() => onstartedit(entry.name)}
					onsave={(value) => onsave(entry.name, value)}
					{ondiscard}
					onarchive={(archived) => onarchive(entry.name, archived)}
				/>
			{/each}
		</ul>
	{/if}

	{#if archived.length > 0}
		<h2 class="tag-group">Archived</h2>
		<ul class="tag-list">
			{#each archived as entry (entry.name)}
				<TagRow
					{entry}
					busy={busy === entry.name}
					editing={editing === entry.name}
					onstartedit={() => onstartedit(entry.name)}
					onsave={(value) => onsave(entry.name, value)}
					{ondiscard}
					onarchive={(archived) => onarchive(entry.name, archived)}
				/>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.tag-table {
		display: flex;
		flex-direction: column;
		--tag-cols: minmax(0, 1fr) 5rem 4rem 6.5rem;
	}

	.tag-head {
		display: grid;
		grid-template-columns: var(--tag-cols);
		align-items: center;
		gap: var(--space-3);
		padding: 0 var(--space-2) var(--space-2);
		border-bottom: 1px solid var(--border);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.tag-head span:nth-child(2),
	.tag-head span:nth-child(3) {
		text-align: right;
	}

	.tag-group {
		margin: var(--space-5) 0 var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.tag-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.empty {
		margin: 0;
		padding: var(--space-4) var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	@media (max-width: 820px) {
		.tag-table {
			--tag-cols: minmax(0, 1fr) 4rem 6.5rem;
		}

		.tag-head {
			display: none;
		}
	}
</style>
