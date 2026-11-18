<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";
	import { fetchFresh } from "#lib/api/fresh.ts";
	import {
		addPlanItem,
		createPlan,
		getPlan,
		getPlans,
		type PlanWithCounts,
		removePlanItem,
		reorderPlanItems,
	} from "#lib/api/plans.ts";
	import { getTasks } from "#lib/api/tasks.ts";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import TaskSelect from "#lib/components/ui/select/TaskSelect.svelte";
	import { taskHref } from "#lib/navigation/href.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import type { Task } from "#lib/types.ts";
	import Plus from "~icons/lucide/plus";

	const { fresh } = useBoard();

	let plans = $state<PlanWithCounts[]>([]);
	let selectedId = $state<string | null>(null);
	let detail = $state<PlanWithCounts | null>(null);
	let items = $state<Task[]>([]);
	let candidates = $state<Task[]>([]);
	let itemFailed = $state(false);
	let loaded = $state(false);
	let failed = $state(false);
	let dragKey = $state<string | null>(null);
	let reorderFailed = $state(false);
	let newName = $state("");
	let creating = $state(false);
	let createFailed = $state(false);

	async function submitNew(): Promise<void> {
		const name = newName.trim();
		if (name === "") return;
		creating = true;
		try {
			const plan = await createPlan({ name });
			newName = "";
			createFailed = false;
			selectedId = plan.id;
			await reloadPlans();
		} catch {
			createFailed = true;
		} finally {
			creating = false;
		}
	}

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
			const [plan, page, all] = await Promise.all([
				fetchFresh(getPlan({ plan_id: id })),
				fetchFresh(
					getTasks({
						plan_id: id,
						sort: "plan_position",
						limit: 1000,
						include_deleted: true,
					}),
				),
				fetchFresh(getTasks({ limit: 1000 })),
			]);
			detail = plan;
			items = page.items;
			candidates = all.items;
		} catch {
			failed = true;
		}
	}

	async function changeItems(action: () => Promise<unknown>): Promise<void> {
		if (detail === null) return;
		const id = detail.id;
		itemFailed = false;
		try {
			await action();
			await reloadPlans();
		} catch {
			itemFailed = true;
		}
		await loadDetail(id);
	}

	const tasksById = $derived(
		new Map<string, Task>(
			[...candidates, ...items].map((task) => [task.id, task] as const),
		),
	);

	function taskLink(id: string): string | null {
		const task = tasksById.get(id);
		return task === undefined ? null : taskHref(task.project_id, id);
	}

	async function moveItem(target: string): Promise<void> {
		const source = dragKey;
		dragKey = null;
		if (source === null || source === target || detail === null) return;

		const from = items.findIndex((item) => item.id === source);
		const to = items.findIndex((item) => item.id === target);
		if (from < 0 || to < 0) return;

		const next = [...items];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		items = next;
		reorderFailed = false;

		try {
			await reorderPlanItems({
				plan_id: detail.id,
				task_ids: next.map((item) => item.id),
			});
		} catch {
			reorderFailed = true;
			await loadDetail(detail.id);
		}
	}

	$effect(() => {
		void reloadPlans();
	});

	$effect(() => {
		const offPlans = fresh.register("plans", () => void reloadPlans());
		const offTasks = fresh.register("tasks", () => {
			const id = selectedId ?? plans[0]?.id;
			if (id !== undefined) return loadDetail(id);
		});
		return () => {
			offPlans();
			offTasks();
		};
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
		<form
			class="create"
			onsubmit={(event) => {
				event.preventDefault();
				void submitNew();
			}}
		>
			<TextInput
				class="create-input"
				placeholder="New plan"
				aria-label="New plan name"
				maxlength={200}
				bind:value={newName}
			/>
			<Button
				variant="primary"
				type="submit"
				disabled={creating || newName.trim() === ""}
				title="Create a plan"
			>
				{#snippet icon()}
					<Plus />
				{/snippet}
				Create
			</Button>
		</form>
		{#if createFailed}
			<span class="create-error">Could not create the plan</span>
		{/if}
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
					{@const planId = detail.id}
					<header class="detail-head">
						<h2>{detail.name}</h2>
						<span class="status">{detail.status}</span>
					</header>
					{#if detail.description !== ""}
						<p class="description">{detail.description}</p>
					{/if}
					<h3>Items</h3>
					<div class="add-item">
						<TaskSelect
							items={candidates}
							value={items.map((item) => item.id)}
							onadd={(id) =>
								void changeItems(() =>
									addPlanItem({ plan_id: planId, task_id: id }),
								)}
							onremove={(id) =>
								void changeItems(() =>
									removePlanItem({ plan_id: planId, task_id: id }),
								)}
							href={taskLink}
							placeholder="Add a task to the plan"
							ariaLabel="Plan items"
						/>
					</div>
					{#if itemFailed}
						<p class="item-error">Could not change the plan items</p>
					{/if}
					{#if items.length === 0}
						<p class="empty">No items in this plan</p>
					{:else}
						{#if reorderFailed}
							<p class="reorder-error">Could not save the new order</p>
						{/if}
						<ol class="items">
							{#each items as item (item.id)}
								<li
									draggable="true"
									class:dragging={dragKey === item.id}
									ondragstart={(event) => {
										dragKey = item.id;
										event.dataTransfer?.setData("text/plain", item.id);
									}}
									ondragover={(event) => event.preventDefault()}
									ondrop={(event) => {
										event.preventDefault();
										void moveItem(item.id);
									}}
									ondragend={() => (dragKey = null)}
								>
									<a
										href={taskHref(item.project_id, item.id)}
										draggable="false"
									>
										{item.id}
									</a>
									<span class="item-title" class:epic={item.is_epic}>
										{item.title}
									</span>
									{#if item.deleted_at !== null}
										<span class="item-deleted">deleted</span>
									{/if}
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
		align-items: center;
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

	.create {
		display: flex;
		gap: var(--space-2);
		margin-left: auto;
	}

	.create :global(.create-input) {
		width: 14rem;
	}

	.create-error {
		color: var(--danger);
		font-size: var(--text-sm);
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

	.add-item {
		margin-bottom: var(--space-3);
	}

	.item-error {
		margin: 0 0 var(--space-2);
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.items {
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: item;
	}

	.reorder-error {
		margin: var(--space-2) 0;
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.items li {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		cursor: grab;
	}

	.items li.dragging {
		opacity: 0.5;
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

	.item-deleted {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	@media (max-width: 48rem) {
		.page-head {
			flex-wrap: wrap;
		}

		.create {
			margin-left: 0;
			flex: 1 1 100%;
		}

		.create :global(.create-input) {
			flex: 1 1 auto;
			width: auto;
		}

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
