<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import Checkbox from "@ku6epxboctuk/ui-kit/components/Checkbox.svelte";
	import Segmented from "@ku6epxboctuk/ui-kit/components/Segmented.svelte";
	import SearchBar from "#lib/components/filters/SearchBar.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type {
		PlanStatusFilter,
		PlanStore,
	} from "#lib/state/plans/plans.svelte.ts";
	import { formatDateTime } from "#lib/tasks/presentation/display.ts";
	import PlanRow from "#lib/components/plans/list/PlanRow.svelte";

	interface Props {
		store: PlanStore;
	}

	let { store }: Props = $props();

	const options = [
		{ value: "active", label: "Active" },
		{ value: "all", label: "All" },
		{ value: "closed", label: "Closed" },
	];

	const needle = $derived(store.query.trim().toLowerCase());
	const deletedVisible = $derived(
		needle === ""
			? store.deletedPlans
			: store.deletedPlans.filter(
					(plan) =>
						plan.name.toLowerCase().includes(needle) ||
						plan.key.toLowerCase().includes(needle),
				),
	);
</script>

<div class="plan-column">
	<div class="plan-toolbar">
		<SearchBar
			value={store.query}
			label="Search plans"
			placeholder="Search plans"
			oninput={(value) => void store.setQuery(value)}
			onclear={() => void store.setQuery("")}
		/>
		{#if store.showDeleted}
			<span class="filter-label">Deleted plans</span>
		{:else}
			<span class="filter-label">Status</span>
			<Segmented
				{options}
				value={store.statusFilter}
				label="Status filter"
				onchange={(value) =>
					void store.setStatusFilter(value as PlanStatusFilter)}
			/>
		{/if}
		<label class="deleted-toggle">
			<Checkbox
				checked={store.showDeleted}
				onchange={(event) =>
					void store.setShowDeleted(event.currentTarget.checked)}
			/>
			Show deleted
		</label>
	</div>

	{#if store.restoreFailed}
		<div class="error-wrap">
			<ErrorNote message="Could not restore the plan" />
		</div>
	{/if}

	{#if store.showDeleted}
		{#if store.deletedFailed}
			<p class="empty">Deleted plans are unavailable</p>
		{:else if !store.deletedLoaded}
			<p class="empty">Loading…</p>
		{:else if deletedVisible.length === 0}
			<div class="empty-state">
				{#if store.query.trim() !== ""}
					No matching deleted plans
					<br />Clear search to see other plans
				{:else}
					No deleted plans
				{/if}
			</div>
		{:else}
			<ul class="plan-list">
				{#each deletedVisible as plan (plan.id)}
					<li class="plan-row deleted-plan-row">
						<div class="deleted-main">
							<span class="plan-key">{plan.key}</span>
							<span class="plan-name">{plan.name}</span>
							<span class="plan-meta">
								{plan.status}
								{#if plan.deleted_at}
									· deleted {formatDateTime(plan.deleted_at)}
								{/if}
							</span>
						</div>
						<Button
							size="sm"
							type="button"
							disabled={store.restoringId === plan.id}
							onclick={() => void store.restore(plan.id)}
						>
							Restore
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if store.plans.length === 0}
		<div class="empty-state">
			{#if store.query.trim() !== ""}
				No matching plans
				<br />Clear search to see other plans
			{:else}
				{store.statusFilter === "active"
					? "No active plans"
					: store.statusFilter === "closed"
						? "No closed plans"
						: "No plans yet"}
				{#if store.statusFilter !== "all"}
					<br />Change the filter to see other plans
				{/if}
			{/if}
		</div>
	{:else}
		<ul class="plan-list">
			{#each store.plans as plan (plan.id)}
				<PlanRow
					{plan}
					active={plan.id === store.activeId}
					onselect={() => store.select(plan.id)}
				/>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.plan-column {
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding: var(--ui-space-3);
		border-right: 1px solid var(--ui-line);
	}

	.plan-toolbar {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--ui-space-2);
		margin-bottom: var(--ui-space-3);
		padding-bottom: var(--ui-space-3);
		border-bottom: 1px solid var(--ui-line);
	}

	.filter-label {
		color: var(--ui-fg-secondary);
		font-family: var(--ui-font-mono);
		font-size: var(--ui-fs-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.deleted-toggle {
		display: flex;
		align-items: center;
		gap: var(--ui-space-2);
		color: var(--ui-fg-secondary);
		font-size: var(--ui-fs-sm);
		cursor: pointer;
	}

	.error-wrap {
		margin-bottom: var(--ui-space-3);
	}

	.plan-list {
		min-height: 0;
		overflow: auto;
		margin: 0;
		padding: 0 0 var(--ui-space-6);
		list-style: none;
	}

	.plan-row {
		display: flex;
		align-items: flex-start;
		gap: var(--ui-space-2);
		padding: var(--ui-space-2);
		border-radius: var(--ui-r-control);
	}

	.deleted-plan-row {
		border: 1px solid var(--ui-line);
	}

	.deleted-main {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--ui-space-1);
	}

	.plan-key {
		color: var(--ui-fg-secondary);
		font-family: var(--ui-font-mono);
		font-size: var(--ui-fs-xs);
	}

	.plan-name {
		max-width: 100%;
		overflow: hidden;
		font-size: var(--ui-fs-md);
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.plan-meta {
		color: var(--ui-fg-secondary);
		font-size: var(--ui-fs-xs);
	}

	.empty-state {
		padding: var(--ui-space-5) var(--ui-space-3);
		border: 1px dashed var(--ui-line-strong);
		text-align: center;
		color: var(--ui-fg-muted);
		font-size: var(--ui-fs-sm);
	}
</style>
