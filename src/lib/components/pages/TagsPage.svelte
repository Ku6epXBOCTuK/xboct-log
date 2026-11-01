<script lang="ts">
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import TagCreateForm from "#lib/components/tags/TagCreateForm.svelte";
	import TagList from "#lib/components/tags/TagList.svelte";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { createTagPage, provideTagPage } from "#lib/state/tag-page.svelte.ts";

	const { tags } = useBoard();

	const page = createTagPage(tags);
	provideTagPage(page);

	$effect(() => {
		void page.reload();
	});
</script>

<section class="tags-page">
	<header class="page-head">
		<h1>Tags</h1>
		<span class="muted"
			>{page.activeTotal} active · {page.archivedTotal} archived</span
		>
	</header>

	<div class="toolbar">
		<input
			class="field-control search"
			placeholder="Filter by name"
			aria-label="Filter tags by name"
			title="Filter the list by a part of the tag name"
			value={page.query}
			oninput={(event) => page.setQuery(event.currentTarget.value)}
		/>
		<TagCreateForm busy={page.isCreating()} oncreate={page.create} />
	</div>

	<p class="hint">
		Lowercase ascii, dash and underscore only, up to 20 characters. Adding a
		name that is archived restores it. Archiving keeps the tag on the tasks that
		already carry it; it only leaves the suggestions.
	</p>

	{#if page.error !== ""}
		<div class="error-wrap">
			<ErrorNote message={page.error} />
		</div>
	{/if}

	<div class="lists">
		{#if page.loaded}
			<TagList
				active={page.active}
				archived={page.archived}
				query={page.query}
			/>
		{:else}
			<p class="empty">Loading…</p>
		{/if}
	</div>

	<button
		class="refresh"
		title="Read the dictionary again"
		onclick={() => void page.reload()}
		disabled={page.isLoading()}
	>
		Reload
	</button>
</section>

<style>
	.tags-page {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: auto;
		background: var(--background);
		--page-max: 48rem;
	}

	.page-head {
		flex: none;
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		max-width: var(--page-max);
		padding: var(--edge-pad) var(--edge-pad) var(--space-3);
	}

	.page-head h1 {
		margin: 0;
		font-size: var(--text-2xl);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.muted {
		color: var(--text-muted);
	}

	.page-head .muted {
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		max-width: var(--page-max);
		padding: 0 var(--edge-pad) var(--space-2);
	}

	.search {
		flex: 1 1 14rem;
		max-width: 22rem;
	}

	.hint {
		margin: 0;
		max-width: var(--page-max);
		padding: 0 var(--edge-pad) var(--space-4);
		color: var(--text-muted);
		font-size: var(--text-xs);
		line-height: 1.5;
	}

	.error-wrap {
		max-width: var(--page-max);
		margin: 0 var(--edge-pad) var(--space-3);
	}

	.lists {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		width: 100%;
		max-width: var(--page-max);
		padding: 0 var(--edge-pad) var(--space-6);
	}

	.empty {
		margin: 0;
		padding: var(--space-4) var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.refresh {
		align-self: flex-start;
		max-width: var(--page-max);
		margin: 0 var(--edge-pad) var(--space-6);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		border-radius: var(--radius);
		padding: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
		cursor: pointer;
	}

	.refresh:hover {
		color: var(--foreground);
		background: var(--hover);
	}
</style>
