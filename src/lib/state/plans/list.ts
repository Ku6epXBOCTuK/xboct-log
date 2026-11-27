import { fetchFresh } from "#lib/api/fresh.ts";
import {
	createPlan,
	deletePlan,
	getDeletedPlans,
	getPlan,
	getPlans,
	restorePlan,
} from "#lib/api/plans/plans.ts";
import { data, dataKey } from "#lib/data/data.svelte.ts";
import { FILTER_STATUSES, listedPlan, withCounts } from "./helpers.ts";
import type { PlanData, PlanStatusFilter, PlansState } from "./types.ts";

const ZERO_COUNTS = {
	tasks_count: 0,
	epics_count: 0,
	closed_tasks_count: 0,
};

export function createPlanList(
	state: PlansState,
	store: PlanData,
	deps: {
		clearDetail: () => void;
		onMutate?: () => void;
	},
) {
	function activeId(): string | null {
		return state.selectedId ?? store.listIds.value[0] ?? null;
	}

	function keepSelectionVisible(): void {
		const ids = store.listIds.value;
		if (state.selectedId !== null && ids.includes(state.selectedId)) return;
		const next = ids[0] ?? null;
		if (next === state.selectedId) return;
		state.selectedId = next;
		if (next === null) deps.clearDetail();
	}

	function sorted(ids: string[]): string[] {
		return [...ids].sort((left, right) => {
			const a = store.plans.get(left);
			const b = store.plans.get(right);
			if (a === undefined || b === undefined) return left.localeCompare(right);
			return a.name.localeCompare(b.name);
		});
	}

	function insert(id: string): void {
		if (store.listIds.value.includes(id)) return;
		store.listIds.set(sorted([...store.listIds.value, id]));
	}

	async function reloadPlans(): Promise<void> {
		const key = dataKey(
			"plans",
			"list",
			state.statusFilter,
			state.query.trim(),
		);
		try {
			await data.load(
				key,
				() =>
					fetchFresh(
						getPlans({
							status: FILTER_STATUSES[state.statusFilter],
							q: state.query.trim() === "" ? undefined : state.query.trim(),
						}),
					),
				(items) => {
					for (const item of items) store.plans.put(item);
					store.listIds.set(items.map((item) => item.id));
				},
				true,
			);
			state.failed = false;
		} catch {
			state.failed = true;
		}
		state.loaded = true;
		keepSelectionVisible();
	}

	async function reloadDeletedPlans(): Promise<void> {
		try {
			await data.load(
				dataKey("plans", "deleted"),
				() => fetchFresh(getDeletedPlans({})),
				(items) => {
					for (const item of items) store.deleted.put(item);
					store.deletedIds.set(items.map((item) => item.id));
				},
				true,
			);
			state.deletedFailed = false;
		} catch {
			state.deletedFailed = true;
		}
		state.deletedLoaded = true;
	}

	async function setShowDeleted(value: boolean): Promise<void> {
		state.showDeleted = value;
		if (value) await reloadDeletedPlans();
	}

	async function deleteActive(): Promise<void> {
		const id = activeId();
		if (id === null || state.deleting) return;
		state.deleting = true;
		state.deleteFailed = false;
		try {
			const deleted = await deletePlan({ plan_id: id });
			store.plans.remove(deleted.id);
			store.deleted.put(deleted);
			store.deletedIds.set(
				sortedDeleted([...store.deletedIds.value, deleted.id]),
			);
			store.listIds.set(
				store.listIds.value.filter((item) => item !== deleted.id),
			);
			if (state.selectedId === deleted.id) state.selectedId = null;
			deps.onMutate?.();
		} catch {
			state.deleteFailed = true;
		} finally {
			state.deleting = false;
		}
	}

	function sortedDeleted(ids: string[]): string[] {
		return [...ids].sort((left, right) => {
			const a = store.deleted.get(left);
			const b = store.deleted.get(right);
			if (a === undefined || b === undefined) return left.localeCompare(right);
			return a.name.localeCompare(b.name);
		});
	}

	async function restore(id: string): Promise<void> {
		if (state.restoringId !== null) return;
		state.restoringId = id;
		state.restoreFailed = false;
		try {
			const restored = await restorePlan({ plan_id: id });
			store.deleted.remove(id);
			store.deletedIds.set(
				store.deletedIds.value.filter((item) => item !== restored.id),
			);
			store.plans.put(withCounts(restored, ZERO_COUNTS));
			insert(restored.id);
			deps.onMutate?.();
		} catch {
			state.restoreFailed = true;
		} finally {
			state.restoringId = null;
		}
	}

	async function setStatusFilter(filter: PlanStatusFilter): Promise<void> {
		state.statusFilter = filter;
		await reloadPlans();
	}

	async function setQuery(value: string): Promise<void> {
		state.query = value;
		await reloadPlans();
	}

	async function create(name: string): Promise<boolean> {
		const trimmed = name.trim();
		if (trimmed === "") return false;
		state.creating = true;
		try {
			const plan = await createPlan({ name: trimmed });
			state.createFailed = false;
			state.statusFilter = "all";
			state.query = "";
			store.plans.put(withCounts(plan, ZERO_COUNTS));
			insert(plan.id);
			state.selectedId = plan.id;
			deps.onMutate?.();
			return true;
		} catch {
			state.createFailed = true;
			return false;
		} finally {
			state.creating = false;
		}
	}

	async function open(id: string): Promise<boolean> {
		const trimmed = id.trim();
		if (trimmed === "") return false;
		try {
			const plan = await getPlan({ plan_id: trimmed });
			state.openFailed = false;
			state.statusFilter = "all";
			state.query = "";
			store.plans.put(listedPlan(plan));
			insert(plan.id);
			state.selectedId = plan.id;
			deps.onMutate?.();
			return true;
		} catch {
			state.openFailed = true;
			return false;
		}
	}

	return {
		reloadPlans,
		reloadDeletedPlans,
		setShowDeleted,
		deleteActive,
		restore,
		setStatusFilter,
		setQuery,
		create,
		open,
	};
}
