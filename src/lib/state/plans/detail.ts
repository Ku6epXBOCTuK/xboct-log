import { fetchFresh } from "#lib/api/fresh.ts";
import { getDocuments, getPlanDocuments } from "#lib/api/plans/documents.ts";
import {
	getPlan,
	listDeletedPlanNotes,
	listPlanNotes,
	type PlanPatchInput,
	type PlanStatus,
	updatePlan,
} from "#lib/api/plans/plans.ts";
import { getTasks } from "#lib/api/tasks/tasks.ts";
import { data, dataKey } from "#lib/data/data.svelte.ts";
import { listedPlan, withCounts } from "./helpers.ts";
import type { PlanData, PlanField, PlansState } from "./types.ts";

const ZERO_COUNTS = {
	tasks_count: 0,
	epics_count: 0,
	closed_tasks_count: 0,
};

export function createPlanDetail(
	state: PlansState,
	store: PlanData,
	onMutate?: () => void,
) {
	function resetEdit(): void {
		state.editedField = null;
		state.editPlanId = null;
		state.fieldDraft = "";
		state.fieldFailed = false;
	}

	function clearDetail(): void {
		state.selectedId = null;
		resetEdit();
	}

	async function loadDetail(id: string, force = false): Promise<void> {
		try {
			await Promise.all([
				data.load(
					dataKey("plans", "record", id),
					() => fetchFresh(getPlan({ plan_id: id })),
					(plan) => store.plans.put(listedPlan(plan)),
					force,
				),
				data.load(
					dataKey("detail", "items", id),
					() =>
						fetchFresh(
							getTasks({
								plan_id: id,
								sort: "plan_position",
								limit: 1000,
								unfinished: false,
								include_deleted: true,
							}),
						),
					(page) => store.items.set(page.items),
					force,
				),
				data.load(
					dataKey("detail", "candidates", id),
					() => fetchFresh(getTasks({ limit: 1000 })),
					(page) => store.candidates.set(page.items),
					force,
				),
				data.load(
					dataKey("detail", "documents", id),
					() => fetchFresh(getPlanDocuments({ plan_id: id })),
					(linked) => store.planDocuments.set(linked),
					force,
				),
				data.load(
					dataKey("detail", "all-documents"),
					() => fetchFresh(getDocuments({})),
					(docs) => store.allDocuments.set(docs),
					force,
				),
				data.load(
					dataKey("detail", "notes", id),
					() => fetchFresh(listPlanNotes({ plan_id: id })),
					(notes) => store.notes.set(notes),
					force,
				),
				data.load(
					dataKey("detail", "deleted-notes", id),
					() => fetchFresh(listDeletedPlanNotes({ plan_id: id })),
					(notes) => store.deletedNotes.set(notes),
					force,
				),
			]);
			if (state.editPlanId !== id) resetEdit();
			state.failed = false;
		} catch {
			state.failed = true;
		}
	}

	function activePlan() {
		const id = state.selectedId ?? store.listIds.value[0] ?? null;
		return id === null ? undefined : store.plans.get(id);
	}

	async function changeStatus(status: PlanStatus): Promise<void> {
		const current = activePlan();
		if (
			current === undefined ||
			state.statusSaving ||
			current.status === status
		)
			return;
		const id = current.id;
		const previous = current.status;
		state.statusSaving = true;
		state.statusFailed = false;
		try {
			const updated = await updatePlan({ plan_id: id, patch: { status } });
			store.plans.put(withCounts(updated, ZERO_COUNTS));
			onMutate?.();
		} catch {
			const stale = store.plans.get(id);
			if (stale !== undefined) {
				store.plans.put({ ...stale, status: previous });
			}
			state.statusFailed = true;
		} finally {
			state.statusSaving = false;
		}
	}

	function patchFor(
		field: PlanField,
		value: string,
	): NonNullable<PlanPatchInput["patch"]> {
		switch (field) {
			case "key":
				return { key: value };
			case "name":
				return { name: value };
			case "description":
				return { description: value };
		}
	}

	function startEdit(field: PlanField): void {
		const plan = activePlan();
		if (plan === undefined || state.fieldSaving) return;
		state.editedField = field;
		state.editPlanId = plan.id;
		state.fieldDraft = plan[field];
		state.fieldFailed = false;
	}

	function cancelEdit(): void {
		if (state.fieldSaving) return;
		resetEdit();
	}

	async function saveEdit(): Promise<void> {
		const plan = activePlan();
		if (plan === undefined || state.editedField === null || state.fieldSaving)
			return;
		const id = plan.id;
		const field = state.editedField;
		const value = state.fieldDraft.trim();
		if (field !== "description" && value === "") {
			state.fieldFailed = true;
			return;
		}
		if (value === plan[field]) {
			resetEdit();
			return;
		}
		state.fieldSaving = true;
		state.fieldFailed = false;
		try {
			const updated = await updatePlan({
				plan_id: id,
				patch: patchFor(field, value),
			});
			resetEdit();
			store.plans.put(withCounts(updated, ZERO_COUNTS));
			onMutate?.();
		} catch {
			state.fieldFailed = true;
		} finally {
			state.fieldSaving = false;
		}
	}

	return {
		clearDetail,
		loadDetail,
		changeStatus,
		startEdit,
		cancelEdit,
		saveEdit,
	};
}
