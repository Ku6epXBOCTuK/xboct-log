import { getDocuments, getPlanDocuments } from "#lib/api/plans/documents.ts";
import { fetchFresh } from "#lib/api/fresh.ts";
import {
	getPlan,
	listDeletedPlanNotes,
	listPlanNotes,
	type PlanPatchInput,
	type PlanStatus,
	updatePlan,
} from "#lib/api/plans/plans.ts";
import { getTasks } from "#lib/api/tasks/tasks.ts";
import { mergePlan } from "./helpers.ts";
import type { PlanField, PlansState } from "./types.ts";

export function createPlanDetail(state: PlansState, onMutate?: () => void) {
	function resetEdit(): void {
		state.editedField = null;
		state.editPlanId = null;
		state.fieldDraft = "";
		state.fieldFailed = false;
	}

	function clearDetail(): void {
		state.detail = null;
		state.items = [];
		resetEdit();
	}

	async function loadDetail(id: string): Promise<void> {
		const revision = state.detailRevision;
		try {
			const [plan, page, all, linked, docs, planNotes, oldNotes] =
				await Promise.all([
					fetchFresh(getPlan({ plan_id: id })),
					fetchFresh(
						getTasks({
							plan_id: id,
							sort: "plan_position",
							limit: 1000,
							unfinished: false,
							include_deleted: true,
						}),
					),
					fetchFresh(getTasks({ limit: 1000 })),
					fetchFresh(getPlanDocuments({ plan_id: id })),
					fetchFresh(getDocuments({})),
					fetchFresh(listPlanNotes({ plan_id: id })),
					fetchFresh(listDeletedPlanNotes({ plan_id: id })),
				]);
			// NOTE: a reload started before a save must not overwrite the saved plan.
			if (revision !== state.detailRevision) return;
			state.detail = plan;
			if (state.editPlanId !== id) resetEdit();
			state.items = page.items;
			state.candidates = all.items;
			state.planDocuments = linked;
			state.allDocuments = docs;
			state.notes = planNotes;
			state.deletedNotes = oldNotes;
		} catch {
			state.failed = true;
		}
	}

	async function changeStatus(status: PlanStatus): Promise<void> {
		if (
			state.detail === null ||
			state.statusSaving ||
			state.detail.status === status
		)
			return;
		const id = state.detail.id;
		const previous = state.detail.status;
		state.detail = { ...state.detail, status };
		state.plans = state.plans.map((plan) =>
			plan.id === id ? { ...plan, status } : plan,
		);
		state.statusSaving = true;
		state.statusFailed = false;
		try {
			const updated = await updatePlan({ plan_id: id, patch: { status } });
			state.detailRevision++;
			state.plans = state.plans.map((plan) =>
				plan.id === id ? mergePlan(plan, updated) : plan,
			);
			if (state.detail !== null && state.detail.id === id)
				state.detail = mergePlan(state.detail, updated);
			onMutate?.();
		} catch {
			state.detail =
				state.detail !== null && state.detail.id === id
					? { ...state.detail, status: previous }
					: state.detail;
			state.plans = state.plans.map((plan) =>
				plan.id === id ? { ...plan, status: previous } : plan,
			);
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
		if (
			state.detail === null ||
			state.detail.id !== (state.selectedId ?? state.plans[0]?.id ?? null) ||
			state.fieldSaving
		)
			return;
		state.editedField = field;
		state.editPlanId = state.detail.id;
		state.fieldDraft = state.detail[field];
		state.fieldFailed = false;
	}

	function cancelEdit(): void {
		if (state.fieldSaving) return;
		resetEdit();
	}

	async function saveEdit(): Promise<void> {
		if (
			state.detail === null ||
			state.editedField === null ||
			state.fieldSaving
		)
			return;
		const id = state.detail.id;
		const field = state.editedField;
		const value = state.fieldDraft.trim();
		if (field !== "description" && value === "") {
			state.fieldFailed = true;
			return;
		}
		if (value === state.detail[field]) {
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
			state.detailRevision++;
			resetEdit();
			state.plans = state.plans.map((plan) =>
				plan.id === id ? mergePlan(plan, updated) : plan,
			);
			if (state.detail !== null && state.detail.id === id)
				state.detail = mergePlan(state.detail, updated);
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
