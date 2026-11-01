<script lang="ts">
	import type { TagInventoryEntry } from "#lib/state/tags.svelte.ts";
	import TagRow from "#lib/components/tags/TagRow.svelte";

	interface Props {
		active: TagInventoryEntry[];
		archived: TagInventoryEntry[];
		query: string;
	}

	let { active, archived, query }: Props = $props();

	const searching = $derived(query.trim() !== "");
</script>

<div class="tag-table">
	<div class="tag-head" aria-hidden="true">
		<span>Tag</span>
		<span>Active</span>
		<span>Backlog</span>
		<span>All</span>
		<span></span>
	</div>

	{#if active.length === 0}
		<p class="empty">{searching ? "Nothing matches" : "No active tags"}</p>
	{:else}
		<ul class="tag-list">
			{#each active as entry (entry.name)}
				<TagRow {entry} />
			{/each}
		</ul>
	{/if}

	{#if archived.length > 0}
		<h2 class="tag-group">Archived</h2>
		<ul class="tag-list">
			{#each archived as entry (entry.name)}
				<TagRow {entry} />
			{/each}
		</ul>
	{/if}
</div>

<style>
	.tag-table {
		display: flex;
		flex-direction: column;
		--tag-cols: minmax(0, 1fr) 5rem 5rem 4rem 6.5rem;
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
	.tag-head span:nth-child(3),
	.tag-head span:nth-child(4) {
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
			--tag-cols: minmax(0, 1fr) 4rem 4rem 6.5rem;
		}

		.tag-head {
			display: none;
		}
	}
</style>
