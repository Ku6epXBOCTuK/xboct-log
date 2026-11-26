import { fetchFresh } from "#lib/api/fresh.ts";
import {
	createPlan,
	deletePlan,
	getDeletedPlans,
	getPlan,
	getPlans,
	restorePlan,
} from "#lib/api/plans/plans.ts";
import { FILTER_STATUSES, upsertPlan, withCounts } from "./helpers.ts";
import type { PlanStatusFilter, PlansState } from "./types.ts";

export function createPlanList(
	state: PlansState,
	deps: {
		clearDetail: () => void;
		onMutate?: () => void;
	},
) {
	function keepSelectionVisible(): void {
		if (
			state.selectedId !== null &&
			state.plans.some((plan) => plan.id === state.selectedId)
		) {
			return;
		}
		const next = state.plans[0]?.id ?? null;
		if (next === state.selectedId) return;
		state.selectedId = next;
		if (next === null) deps.clearDetail();
	}

	async function reloadPlans(): Promise<void> {
		try {
			state.plans = await fetchFresh(
				getPlans({
					status: FILTER_STATUSES[state.statusFilter],
					q: state.query.trim() === "" ? undefined : state.query.trim(),
				}),
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
			state.deletedPlans = await fetchFresh(getDeletedPlans({}));
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
		const id = state.selectedId ?? state.plans[0]?.id ?? null;
		if (id === null || state.deleting) return;
		state.deleting = true;
		state.deleteFailed = false;
		try {
			const deleted = await deletePlan({ plan_id: id });
			state.plans = state.plans.filter((plan) => plan.id !== deleted.id);
			if (state.selectedId === deleted.id) state.selectedId = null;
			if (state.detail?.id === deleted.id) deps.clearDetail();
			deps.onMutate?.();
		} catch {
			state.deleteFailed = true;
		} finally {
			state.deleting = false;
		}
	}

	async function restore(id: string): Promise<void> {
		if (state.restoringId !== null) return;
		state.restoringId = id;
		state.restoreFailed = false;
		try {
			const restored = await restorePlan({ plan_id: id });
			state.deletedPlans = state.deletedPlans.filter(
				(plan) => plan.id !== restored.id,
			);
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
			state.selectedId = plan.id;
			state.plans = upsertPlan(
				state.plans,
				withCounts(plan, {
					tasks_count: 0,
					epics_count: 0,
					closed_tasks_count: 0,
				}),
			);
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
			state.selectedId = plan.id;
			state.plans = upsertPlan(state.plans, plan);
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
