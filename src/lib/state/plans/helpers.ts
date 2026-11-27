import type { Plan, PlanStatus, PlanWithCounts } from "#lib/api/plans/plans.ts";
import type { PlanStatusFilter } from "./types.ts";

export const FILTER_STATUSES: Record<
	PlanStatusFilter,
	PlanStatus[] | undefined
> = {
	all: undefined,
	active: ["backlog", "active"],
	closed: ["done", "cancelled"],
};

export function withCounts(
	plan: Plan,
	counts: Pick<
		PlanWithCounts,
		"tasks_count" | "epics_count" | "closed_tasks_count"
	>,
): PlanWithCounts {
	return { ...plan, ...counts };
}

export function listedPlan(plan: Plan | PlanWithCounts): PlanWithCounts {
	return "tasks_count" in plan
		? plan
		: withCounts(plan, {
				tasks_count: 0,
				epics_count: 0,
				closed_tasks_count: 0,
			});
}

export function mergePlan(
	current: PlanWithCounts,
	updated: Plan,
): PlanWithCounts {
	return {
		...updated,
		tasks_count: current.tasks_count,
		epics_count: current.epics_count,
		closed_tasks_count: current.closed_tasks_count,
	};
}

export function upsertPlan(
	list: PlanWithCounts[],
	plan: PlanWithCounts,
): PlanWithCounts[] {
	const next = list.some((item) => item.id === plan.id)
		? list.map((item) => (item.id === plan.id ? plan : item))
		: [...list, plan];
	return next.sort((left, right) => left.name.localeCompare(right.name));
}
