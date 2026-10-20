<script lang="ts">
	import { activityFieldLabel, activityOpLabel } from "#lib/activity/labels.ts";
	import { listActivityLog } from "#lib/remote/activity.remote.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { formatDateTime } from "#lib/tasks/display.ts";
	import type { ActivityLogItem } from "#lib/types.ts";

	const LIMIT = 50;

	const { projects, filters, setActiveProject } = useBoard();

	let source = $state("");
	let op = $state("");
	let entity = $state("");
	let from = $state("");
	let to = $state("");
	let offset = $state(0);

	let items = $state<ActivityLogItem[]>([]);
	let total = $state(0);
	let ops = $state<string[]>([]);
	let failed = $state(false);
	let loaded = $state(false);
	let requestId = 0;

	$effect(() => {
		void load();
	});

	async function load() {
		const current = ++requestId;
		try {
			const result = await listActivityLog({
				source: source === "" ? undefined : (source as "ui" | "mcp" | "cli"),
				op: op === "" ? undefined : op,
				entity:
					entity === "" ? undefined : (entity as "task" | "project" | "scope"),
				project_id: filters.activeProject ?? undefined,
				from: from === "" ? undefined : `${from}T00:00:00.000Z`,
				to: to === "" ? undefined : `${to}T23:59:59.999Z`,
				limit: LIMIT,
				offset,
			});
			if (current !== requestId) return;
			items = result.items;
			total = result.total;
			ops = result.ops;
			failed = false;
			loaded = true;
		} catch {
			if (current !== requestId) return;
			failed = true;
		}
	}

	function reset() {
		source = "";
		op = "";
		entity = "";
		from = "";
		to = "";
		offset = 0;
		setActiveProject(null);
	}

	const hasFilters = $derived(
		filters.activeProject !== null ||
			source !== "" ||
			op !== "" ||
			entity !== "" ||
			from !== "" ||
			to !== "",
	);
	const canPrev = $derived(offset > 0);
	const canNext = $derived(offset + LIMIT < total);
</script>

<section class="activity-page">
	<header class="page-head">
		<h1>Activity</h1>
		<span class="muted">{total} entries</span>
	</header>

	<div class="filters">
		<label class="filter">
			<span>Project</span>
			<select
				class="control"
				value={filters.activeProject ?? ""}
				onchange={(event) => {
					const value = event.currentTarget.value;
					offset = 0;
					setActiveProject(value === "" ? null : value);
				}}
			>
				<option value="">Any</option>
				{#each projects.all as project (project.id)}
					<option value={project.id}>{project.name}</option>
				{/each}
			</select>
		</label>
		<label class="filter">
			<span>Source</span>
			<select class="control" bind:value={source} onchange={() => (offset = 0)}>
				<option value="">Any</option>
				<option value="ui">ui</option>
				<option value="mcp">mcp</option>
				<option value="cli">cli</option>
			</select>
		</label>
		<label class="filter">
			<span>Operation</span>
			<select class="control" bind:value={op} onchange={() => (offset = 0)}>
				<option value="">Any</option>
				{#each ops as name (name)}
					<option value={name}>{name}</option>
				{/each}
			</select>
		</label>
		<label class="filter">
			<span>Entity</span>
			<select class="control" bind:value={entity} onchange={() => (offset = 0)}>
				<option value="">Any</option>
				<option value="task">task</option>
				<option value="project">project</option>
				<option value="scope">scope</option>
			</select>
		</label>
		<label class="filter">
			<span>From</span>
			<input
				class="control"
				type="date"
				bind:value={from}
				onchange={() => (offset = 0)}
			/>
		</label>
		<label class="filter">
			<span>To</span>
			<input
				class="control"
				type="date"
				bind:value={to}
				onchange={() => (offset = 0)}
			/>
		</label>
		{#if hasFilters}
			<button class="reset" onclick={reset}>Reset</button>
		{/if}
	</div>

	{#if failed}
		<p class="empty">Activity log is unavailable</p>
	{:else if !loaded}
		<p class="empty">Loading…</p>
	{:else if items.length === 0}
		<p class="empty">
			{hasFilters ? "No entries match the filters" : "No activity recorded yet"}
		</p>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th class="when-col">When</th>
						<th class="source-col">Source</th>
						<th class="op-col">Operation</th>
						<th class="entity-col">Entity</th>
						<th>Fields</th>
					</tr>
				</thead>
				<tbody>
					{#each items as item, index (index)}
						<tr>
							<td class="when">{formatDateTime(item.ts)}</td>
							<td>
								<span class="source" data-source={item.source}
									>{item.source}</span
								>
							</td>
							<td class="op">{activityOpLabel(item.op)}</td>
							<td class="entity">
								<span class="entity-type">{item.entity}</span>
								<span class="entity-id">{item.entity_id}</span>
								{#if item.old_id !== null}
									<span class="was">was {item.old_id}</span>
								{/if}
							</td>
							<td class="fields">
								{#if item.fields.length > 0}
									<span class="field-chip"
										>{activityFieldLabel(item.fields[0])}</span
									>
									{#each item.fields.slice(1) as field (field)}
										<span class="field-chip">{activityFieldLabel(field)}</span>
									{/each}
								{:else}
									—
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<footer class="pager">
		<span class="muted">
			{total === 0
				? "0 entries"
				: `${offset + 1}–${Math.min(offset + LIMIT, total)} of ${total}`}
		</span>
		<div class="pager-buttons">
			<button
				class="page-button"
				disabled={!canPrev}
				onclick={() => (offset = Math.max(0, offset - LIMIT))}
			>
				Previous
			</button>
			<button
				class="page-button"
				disabled={!canNext}
				onclick={() => (offset = offset + LIMIT)}
			>
				Next
			</button>
		</div>
	</footer>
</section>

<style>
	.activity-page {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--background);
	}

	.page-head {
		flex: none;
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
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
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.filters {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3);
		padding: 0 var(--edge-pad) var(--space-4);
	}

	.filter {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.control {
		min-height: var(--control-h-sm);
		border: 1px solid var(--border-strong);
		background: var(--field);
		color: var(--foreground);
		border-radius: var(--radius);
		padding: 0 var(--space-2);
		font-size: var(--text-sm);
	}

	.reset {
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		padding: 0 var(--space-3);
		min-height: var(--control-h-sm);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.reset:hover {
		background: var(--hover);
		color: var(--foreground);
	}

	.table-wrap {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		padding: 0 var(--edge-pad);
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--background);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}

	td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
		vertical-align: top;
	}

	.when-col,
	.source-col,
	.op-col {
		width: 1%;
		white-space: nowrap;
	}

	.entity-col {
		width: 1%;
	}

	.when {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.source {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}

	.source[data-source="mcp"] {
		border-color: var(--accent);
		color: var(--accent-ink);
	}

	.source[data-source="ui"] {
		color: var(--text-muted);
	}

	.op {
		white-space: nowrap;
	}

	.entity {
		white-space: nowrap;
	}

	.entity-type {
		color: var(--text-muted);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-right: var(--space-2);
	}

	.entity-id {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.was {
		display: block;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.fields {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.field-chip {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--field);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.empty {
		margin: 0;
		padding: var(--space-8) var(--edge-pad);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.pager {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--edge-pad);
		border-top: 1px solid var(--border);
	}

	.pager-buttons {
		display: flex;
		gap: var(--space-2);
	}

	.page-button {
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		padding: 0 var(--space-3);
		min-height: var(--control-h-sm);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.page-button:hover:not(:disabled) {
		background: var(--hover);
		color: var(--foreground);
	}
</style>
