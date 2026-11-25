import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Document } from "#lib/api/documents.ts";
import type { Plan, PlanNote, PlanWithCounts } from "#lib/api/plans.ts";
import type { Task } from "#lib/types.ts";

const getPlans = vi.fn();
const getDeletedPlans = vi.fn();
const getPlan = vi.fn();
const createPlan = vi.fn();
const updatePlan = vi.fn();
const deletePlan = vi.fn();
const restorePlan = vi.fn();
const addPlanItem = vi.fn();
const removePlanItem = vi.fn();
const reorderPlanItems = vi.fn();
const listPlanNotes = vi.fn();
const addPlanNote = vi.fn();
const editPlanNote = vi.fn();
const deletePlanNote = vi.fn();
const listDeletedPlanNotes = vi.fn();
const restorePlanNote = vi.fn();
const listPlanNoteRevisions = vi.fn();
const getTasks = vi.fn();
const getDocuments = vi.fn();
const getPlanDocuments = vi.fn();
const linkDocumentToPlan = vi.fn();
const unlinkDocumentFromPlan = vi.fn();

vi.mock("#lib/api/plans.ts", () => ({
	getPlans: (input: unknown) => getPlans(input),
	getDeletedPlans: (input: unknown) => getDeletedPlans(input),
	getPlan: (input: unknown) => getPlan(input),
	createPlan: (input: unknown) => createPlan(input),
	updatePlan: (input: unknown) => updatePlan(input),
	deletePlan: (input: unknown) => deletePlan(input),
	restorePlan: (input: unknown) => restorePlan(input),
	addPlanItem: (input: unknown) => addPlanItem(input),
	removePlanItem: (input: unknown) => removePlanItem(input),
	reorderPlanItems: (input: unknown) => reorderPlanItems(input),
	listPlanNotes: (input: unknown) => listPlanNotes(input),
	addPlanNote: (input: unknown) => addPlanNote(input),
	editPlanNote: (input: unknown) => editPlanNote(input),
	deletePlanNote: (input: unknown) => deletePlanNote(input),
	listDeletedPlanNotes: (input: unknown) => listDeletedPlanNotes(input),
	restorePlanNote: (input: unknown) => restorePlanNote(input),
	listPlanNoteRevisions: (input: unknown) => listPlanNoteRevisions(input),
}));

vi.mock("#lib/api/tasks.ts", () => ({
	getTasks: (input: unknown) => getTasks(input),
}));

vi.mock("#lib/api/documents.ts", () => ({
	getDocuments: (input: unknown) => getDocuments(input),
	getPlanDocuments: (input: unknown) => getPlanDocuments(input),
	linkDocumentToPlan: (input: unknown) => linkDocumentToPlan(input),
	unlinkDocumentFromPlan: (input: unknown) => unlinkDocumentFromPlan(input),
}));

vi.mock("#lib/api/fresh.ts", () => ({
	fetchFresh: (query: unknown) => query,
}));

const { createPlanStore } = await import("./plans.svelte.ts");

const DATE = "2026-01-01T00:00:00.000Z";

function plan(id: string, extra: Partial<Plan> = {}): Plan {
	return {
		id,
		key: id,
		number: Number(id.split("-")[1]),
		name: id,
		description: "",
		status: "backlog",
		created_at: DATE,
		updated_at: DATE,
		closed_at: null,
		deleted_at: null,
		...extra,
	};
}

function listed(
	entry: Plan,
	extra: Partial<PlanWithCounts> = {},
): PlanWithCounts {
	return {
		...entry,
		tasks_count: 0,
		epics_count: 0,
		closed_tasks_count: 0,
		...extra,
	};
}

function task(id: string, extra: Partial<Task> = {}): Task {
	return {
		plan_ids: [],
		id,
		project_id: "spa",
		number: Number(id.split("-")[1]),
		title: id,
		description: "",
		status: "open",
		priority: "medium",
		is_epic: false,
		epic_id: null,
		scope_id: null,
		source_file: null,
		estimate: null,
		assignee: null,
		due_at: null,
		tags: [],
		created_at: DATE,
		updated_at: DATE,
		closed_at: null,
		closed_reason: null,
		blocked_reason: null,
		deleted_at: null,
		blocked_by: [],
		blocks: [],
		...extra,
	};
}

function note(
	id: string,
	key: string,
	extra: Partial<PlanNote> = {},
): PlanNote {
	return {
		id,
		plan_id: "PL-1",
		key,
		body: "body",
		created_at: DATE,
		edited_at: null,
		deleted_at: null,
		...extra,
	};
}

function document(id: string, extra: Partial<Document> = {}): Document {
	return {
		id,
		project_id: "spa",
		number: Number(id.split("-")[1]),
		key: id,
		kind: "adr",
		title: id,
		body: "",
		status: "draft",
		created_at: DATE,
		updated_at: DATE,
		closed_at: null,
		deleted_at: null,
		...extra,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	getPlans.mockResolvedValue([
		listed(plan("PL-1"), { tasks_count: 2, closed_tasks_count: 1 }),
	]);
	getDeletedPlans.mockResolvedValue([]);
	getPlan.mockResolvedValue(
		listed(plan("PL-1"), { tasks_count: 2, closed_tasks_count: 1 }),
	);
	getTasks.mockResolvedValue({ items: [task("SPA-1")], total: 1 });
	getDocuments.mockResolvedValue([]);
	getPlanDocuments.mockResolvedValue([]);
	listPlanNotes.mockResolvedValue([]);
	listDeletedPlanNotes.mockResolvedValue([]);
	listPlanNoteRevisions.mockResolvedValue([]);
});

async function loaded(onMutate?: () => void) {
	const store = createPlanStore(onMutate);
	await store.reloadPlans();
	await store.loadDetail("PL-1");
	getPlans.mockClear();
	getPlan.mockClear();
	return store;
}

describe("plan store mutations", () => {
	it("applies the status response locally and reports the mutation once", async () => {
		const onMutate = vi.fn();
		const store = await loaded(onMutate);
		updatePlan.mockResolvedValue(
			plan("PL-1", {
				status: "done",
				updated_at: "2026-02-02T00:00:00.000Z",
			}),
		);

		await store.changeStatus("done");

		expect(store.detail?.status).toBe("done");
		expect(store.detail?.updated_at).toBe("2026-02-02T00:00:00.000Z");
		expect(store.plans[0]?.status).toBe("done");
		expect(store.plans[0]?.tasks_count).toBe(2);
		expect(onMutate).toHaveBeenCalledTimes(1);
		expect(getPlans).not.toHaveBeenCalled();
	});

	it("reverts the optimistic status when the write fails", async () => {
		const onMutate = vi.fn();
		const store = await loaded(onMutate);
		updatePlan.mockRejectedValue(new Error("offline"));

		await store.changeStatus("done");

		expect(store.detail?.status).toBe("backlog");
		expect(store.plans[0]?.status).toBe("backlog");
		expect(store.statusFailed).toBe(true);
		expect(onMutate).not.toHaveBeenCalled();
	});

	it("applies edited fields without reloading the list or the detail", async () => {
		const onMutate = vi.fn();
		const store = await loaded(onMutate);
		updatePlan.mockResolvedValue(
			plan("PL-1", { name: "Renamed", key: "PL-99" }),
		);
		store.startEdit("name");
		store.setFieldDraft("Renamed");

		await store.saveEdit();

		expect(store.detail?.name).toBe("Renamed");
		expect(store.detail?.key).toBe("PL-99");
		expect(store.detail?.tasks_count).toBe(2);
		expect(store.plans[0]?.name).toBe("Renamed");
		expect(store.editedField).toBeNull();
		expect(onMutate).toHaveBeenCalledTimes(1);
		expect(getPlans).not.toHaveBeenCalled();
		expect(getPlan).not.toHaveBeenCalled();
	});

	it("adds a created plan from the response with zero counts", async () => {
		const onMutate = vi.fn();
		const store = await loaded(onMutate);
		createPlan.mockResolvedValue(plan("PL-2", { name: "Alpha" }));

		await store.create("Alpha");

		expect(store.plans.find((item) => item.id === "PL-2")?.tasks_count).toBe(0);
		expect(store.activeId).toBe("PL-2");
		expect(onMutate).toHaveBeenCalledTimes(1);
		expect(getPlans).not.toHaveBeenCalled();
	});

	it("opens a plan from the response without reloading the list", async () => {
		const onMutate = vi.fn();
		const store = await loaded(onMutate);
		getPlan.mockResolvedValue(
			listed(plan("PL-2", { name: "Beta" }), { tasks_count: 3 }),
		);

		await store.open("PL-2");

		expect(store.plans.find((item) => item.id === "PL-2")?.tasks_count).toBe(3);
		expect(store.activeId).toBe("PL-2");
		expect(onMutate).toHaveBeenCalledTimes(1);
		expect(getPlans).not.toHaveBeenCalled();
	});

	it("applies note and document responses and reports both mutations", async () => {
		const onMutate = vi.fn();
		const store = await loaded(onMutate);
		addPlanNote.mockResolvedValue(note("N-1", "SPA-1", { body: "check" }));
		linkDocumentToPlan.mockResolvedValue(document("D-1", { title: "Doc" }));

		await store.addNote("PL-1", "SPA-1", "check");
		await store.linkDocument("PL-1", "D-1");

		expect(store.notes.map((item) => item.body)).toEqual(["check"]);
		expect(store.noteDrafts["SPA-1"]).toBe("");
		expect(store.planDocuments.map((item) => item.id)).toEqual(["D-1"]);
		expect(onMutate).toHaveBeenCalledTimes(2);
		expect(getPlans).not.toHaveBeenCalled();
		expect(getPlan).not.toHaveBeenCalled();
	});

	it("moves deleted and restored notes between lists locally", async () => {
		const onMutate = vi.fn();
		listPlanNotes.mockResolvedValue([note("N-1", "SPA-1", { body: "check" })]);
		const store = await loaded(onMutate);
		deletePlanNote.mockResolvedValue(
			note("N-1", "SPA-1", { body: "check", deleted_at: DATE }),
		);
		restorePlanNote.mockResolvedValue(note("N-1", "SPA-1", { body: "check" }));

		await store.removeNote("N-1");
		expect(store.notes).toHaveLength(0);
		expect(store.deletedNotes).toHaveLength(1);

		await store.restoreNote("N-1");
		expect(store.notes).toHaveLength(1);
		expect(store.deletedNotes).toHaveLength(0);
		expect(onMutate).toHaveBeenCalledTimes(2);
		expect(getPlan).not.toHaveBeenCalled();
	});

	it("reports an item mutation and refreshes only the detail", async () => {
		const onMutate = vi.fn();
		const store = await loaded(onMutate);
		addPlanItem.mockResolvedValue({ key: "SPA-1" });

		await store.addItem("PL-1", "SPA-1");

		expect(store.itemFailed).toBe(false);
		expect(onMutate).toHaveBeenCalledTimes(1);
		expect(getPlan).toHaveBeenCalledTimes(1);
		expect(getPlans).not.toHaveBeenCalled();
	});

	it("keeps the optimistic order on reorder and reloads the detail on failure", async () => {
		const onMutate = vi.fn();
		getTasks.mockResolvedValue({
			items: [task("SPA-1"), task("SPA-2")],
			total: 2,
		});
		const store = await loaded(onMutate);
		store.setDragKey("SPA-1");
		reorderPlanItems.mockResolvedValue([]);

		await store.moveItem("SPA-2");
		expect(store.items.map((item) => item.id)).toEqual(["SPA-2", "SPA-1"]);
		expect(onMutate).toHaveBeenCalledTimes(1);

		store.setDragKey("SPA-2");
		reorderPlanItems.mockRejectedValue(new Error("offline"));
		await store.moveItem("SPA-1");
		expect(store.reorderFailed).toBe(true);
		expect(store.items.map((item) => item.id)).toEqual(["SPA-1", "SPA-2"]);
		expect(onMutate).toHaveBeenCalledTimes(1);
	});

	it("still reloads the list for read-side filters", async () => {
		const onMutate = vi.fn();
		const store = await loaded(onMutate);

		await store.setQuery("alpha");

		expect(getPlans).toHaveBeenCalledTimes(1);
		expect(onMutate).not.toHaveBeenCalled();
	});
});
