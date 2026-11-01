<script lang="ts">
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import TagCreateForm from "#lib/components/tags/TagCreateForm.svelte";
	import TagList from "#lib/components/tags/TagList.svelte";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";

	const { tags } = useBoard();

	let error = $state("");
	let busy = $state("");
	let loaded = $state(false);
	let query = $state("");
	let editing = $state<string | null>(null);

	const all = $derived(tags.inventory);
	const filtered = $derived(
		query.trim() === ""
			? all
			: all.filter((entry) => entry.name.includes(query.trim().toLowerCase())),
	);
	const active = $derived(filtered.filter((entry) => !entry.archived));
	const archived = $derived(filtered.filter((entry) => entry.archived));
	const activeTotal = $derived(all.filter((entry) => !entry.archived).length);
	const archivedTotal = $derived(all.length - activeTotal);

	async function run(key: string, work: () => Promise<unknown>) {
		error = "";
		busy = key;
		try {
			await work();
			return true;
		} catch (cause) {
			error = messageOf(cause);
			return false;
		} finally {
			busy = "";
		}
	}

	function reload() {
		void run("load", async () => {
			await tags.refresh();
			loaded = true;
		});
	}

	$effect(() => {
		reload();
	});

	function create(name: string) {
		return run("create", () => tags.create(name));
	}

	function rename(name: string, value: string) {
		editing = null;
		void run(name, () => tags.rename(name, value));
	}

	function archive(name: string, archived: boolean) {
		void run(name, () => tags.setArchived(name, archived));
	}

	function discard() {
		editing = null;
	}
</script>

<section class="tags-page">
	<header class="page-head">
		<h1>Tags</h1>
		<span class="muted">{activeTotal} active · {archivedTotal} archived</span>
	</header>

	<div class="toolbar">
		<input
			class="field-control search"
			placeholder="Filter by name"
			aria-label="Filter tags by name"
			title="Filter the list by a part of the tag name"
			bind:value={query}
		/>
		<TagCreateForm busy={busy === "create"} oncreate={create} />
	</div>

	<p class="hint">
		Lowercase ascii, dash and underscore only, up to 20 characters. Adding a
		name that is archived restores it. Archiving keeps the tag on the tasks that
		already carry it; it only leaves the suggestions.
	</p>

	{#if error !== ""}
		<div class="error-wrap">
			<ErrorNote message={error} />
		</div>
	{/if}

	<div class="lists">
		{#if loaded}
			<TagList
				{active}
				{archived}
				{query}
				{busy}
				{editing}
				onstartedit={(name) => (editing = name)}
				onsave={rename}
				ondiscard={discard}
				onarchive={archive}
			/>
		{:else}
			<p class="empty">Loading…</p>
		{/if}
	</div>

	<button
		class="refresh"
		title="Read the dictionary again"
		onclick={reload}
		disabled={busy === "load"}
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
