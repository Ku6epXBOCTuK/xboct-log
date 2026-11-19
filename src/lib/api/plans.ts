import { client, unwrap } from "./client.ts";
import type { components } from "./schema.d.ts";

export type Plan = components["schemas"]["Plan"];
export type PlanWithCounts = components["schemas"]["PlanWithCounts"];
export type PlanStatus = components["schemas"]["PlanStatus"];
export type PlanItem = components["schemas"]["PlanItem"];
export type PlanNote = components["schemas"]["PlanNote"];

export interface NewPlanInput {
	name: string;
	description?: string | null;
	status?: PlanStatus | null;
}

export interface PlanPatchInput {
	plan_id: string;
	patch?: { name?: string; description?: string; status?: PlanStatus };
	expected_updated_at?: string | null;
}

export interface PlanItemInput {
	plan_id: string;
	task_id: string;
}

export interface PlanListInput {
	include_deleted?: boolean;
	deleted_only?: boolean;
}

export async function getPlans(
	input: PlanListInput = {},
): Promise<PlanWithCounts[]> {
	const answer = await client.POST("/api/plans_list", { body: input });
	return unwrap<{ items: PlanWithCounts[] }>(answer).items;
}

export async function getPlan(input: {
	plan_id: string;
}): Promise<PlanWithCounts> {
	return unwrap<PlanWithCounts>(
		await client.POST("/api/plans_get", { body: input }),
	);
}

export async function getDeletedPlans(
	input: Record<string, never> = {},
): Promise<Plan[]> {
	const answer = await client.POST("/api/plans_deleted_list", { body: input });
	return unwrap<{ items: Plan[] }>(answer).items;
}

export async function createPlan(input: NewPlanInput): Promise<Plan> {
	return unwrap<Plan>(await client.POST("/api/plans_create", { body: input }));
}

export async function updatePlan(input: PlanPatchInput): Promise<Plan> {
	return unwrap<Plan>(await client.POST("/api/plans_update", { body: input }));
}

export async function deletePlan(input: { plan_id: string }): Promise<Plan> {
	return unwrap<Plan>(await client.POST("/api/plans_delete", { body: input }));
}

export async function restorePlan(input: { plan_id: string }): Promise<Plan> {
	return unwrap<Plan>(await client.POST("/api/plans_restore", { body: input }));
}

export async function addPlanItem(input: PlanItemInput): Promise<PlanItem> {
	return unwrap<PlanItem>(
		await client.POST("/api/plans_items_add", { body: input }),
	);
}

export async function removePlanItem(
	input: PlanItemInput,
): Promise<PlanItem | null> {
	return unwrap<PlanItem | null>(
		await client.POST("/api/plans_items_remove", { body: input }),
	);
}

export async function reorderPlanItems(input: {
	plan_id: string;
	task_ids: string[];
}): Promise<PlanItem[]> {
	const answer = await client.POST("/api/plans_reorder", { body: input });
	return unwrap<{ items: PlanItem[] }>(answer).items;
}

export async function listPlanNotes(input: {
	plan_id: string;
}): Promise<PlanNote[]> {
	const answer = await client.POST("/api/plans_notes_list", { body: input });
	return unwrap<{ items: PlanNote[] }>(answer).items;
}

export async function addPlanNote(input: {
	plan_id: string;
	task_id: string;
	body: string;
}): Promise<PlanNote> {
	return unwrap<PlanNote>(
		await client.POST("/api/plans_notes_add", { body: input }),
	);
}

export async function editPlanNote(input: {
	note_id: string;
	body: string;
}): Promise<PlanNote> {
	return unwrap<PlanNote>(
		await client.POST("/api/plans_notes_edit", { body: input }),
	);
}

export async function deletePlanNote(input: {
	note_id: string;
}): Promise<PlanNote> {
	return unwrap<PlanNote>(
		await client.POST("/api/plans_notes_delete", { body: input }),
	);
}
