<script lang="ts">
	import { fetchFresh } from "#lib/api/fresh.ts";
	import { getPlan, getPlans, type PlanWithCounts } from "#lib/api/plans.ts";
	import { getTasks } from "#lib/api/tasks.ts";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import { taskHref } from "#lib/navigation/href.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import type { Task } from "#lib/types.ts";

	const { fresh } = useBoard();

	let plans = $state<PlanWithCounts[]>([]);
	let selectedId = $state<string | null>(null);
	let detail = $state<PlanWithCounts | null>(null);
	let items = $state<Task[]>([]);
	let loaded = $state(false);
	let failed = $state(false);

	async function reloadPlans(): Promise<void> {
		try {
			plans = await fetchFresh(getPlans({}));
			failed = false;
		} catch {
			failed = true;
		}
		loaded = true;
	}

	async function loadDetail(id: string): Promise<void> {
		try {
			const [plan, page] = await Promise.all([
				fetchFresh(getPlan({ plan_id: id })),
				fetchFresh(
					getTasks({
						plan_id: id,
						sort: "plan_position",
						limit: 1000,
					}),
				),
			]);
			detail = plan;
			items = page.items;
		} catch {
			failed = true;
		}
	}

	$effect(() => {
		void reloadPlans();
	});

	$effect(() => {
		const off = fresh.register("plans", () => void reloadPlans());
		return off;
	});

	$effect(() => {
		const id = selectedId ?? plans[0]?.id ?? null;
		if (id === null) {
			detail = null;
			items = [];
			return;
		}
		void loadDetail(id);
	});
</script>

<section class="plans-page">
	<header class="page-head">
		<h1>Plans</h1>
		<span class="muted">{plans.length} plans</span>
	</header>

	{#if failed}
		<div class="error-wrap">
			<ErrorNote message="Plans are unavailable" />
		</div>
	{/if}

	{#if !loaded}
		<p class="empty">Loading…</p>
	{:else if plans.length === 0}
		<p class="empty">No plans yet</p>
	{:else}
		<div class="columns">
			<ul class="plan-list">
				{#each plans as plan (plan.id)}
					<li>
						<button
							class="plan-link"
							class:active={plan.id === (selectedId ?? plans[0]?.id)}
							onclick={() => (selectedId = plan.id)}
						>
							<span class="plan-name">{plan.name}</span>
							<span class="plan-meta">
								{plan.status}
								· {plan.tasks_count} tasks · {plan.epics_count} epics
							</span>
						</button>
					</li>
				{/each}
			</ul>

			<div class="detail">
				{#if detail}
					<header class="detail-head">
						<h2>{detail.name}</h2>
						<span class="status">{detail.status}</span>
					</header>
					{#if detail.description !== ""}
						<p class="description">{detail.description}</p>
					{/if}
					<h3>Items</h3>
					{#if items.length === 0}
						<p class="empty">No items in this plan</p>
					{:else}
						<ol class="items">
							{#each items as item (item.id)}
								<li>
									<a href={taskHref(item.project_id, item.id)}>{item.id}</a>
									<span class="item-title" class:epic={item.is_epic}>
										{item.title}
									</span>
								</li>
							{/each}
						</ol>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.plans-page {
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

	.error-wrap {
		margin: 0 var(--edge-pad) var(--space-3);
	}

	.empty {
		margin: 0;
		padding: var(--space-8) var(--edge-pad);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.columns {
		flex: 1 1 auto;
		min-height: 0;
		display: grid;
		grid-template-columns: 20rem minmax(0, 1fr);
	}

	.plan-list {
		min-height: 0;
		overflow: auto;
		margin: 0;
		padding: 0 var(--space-2) var(--space-6) var(--edge-pad);
		list-style: none;
		border-right: 1px solid var(--border);
	}

	.plan-link {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-secondary);
		text-align: left;
		cursor: pointer;
	}

	.plan-link:hover {
		background: var(--hover);
	}

	.plan-link.active {
		background: var(--selected);
		color: var(--foreground);
	}

	.plan-name {
		font-size: var(--text-md);
		font-weight: 500;
	}

	.plan-meta {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.detail {
		min-height: 0;
		overflow: auto;
		padding: 0 var(--edge-pad) var(--space-6);
	}

	.detail-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.detail-head h2 {
		margin: 0;
		font-size: var(--text-xl);
	}

	.status {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.description {
		margin: var(--space-3) 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.detail h3 {
		margin: var(--space-5) 0 var(--space-2);
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.items {
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: item;
	}

	.items li {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
	}

	.items li::before {
		counter-increment: item;
		content: counter(item) ".";
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.items a {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.item-title {
		font-size: var(--text-sm);
	}

	.item-title.epic {
		font-weight: 600;
	}

	@media (max-width: 48rem) {
		.columns {
			grid-template-columns: minmax(0, 1fr);
			overflow: auto;
		}

		.plan-list {
			max-height: 16rem;
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}
	}
</style>
