import {
	type Document,
	getDocuments,
	getPlanDocuments,
	linkDocumentToPlan,
	unlinkDocumentFromPlan,
} from "#lib/api/documents.ts";
import { fetchFresh } from "#lib/api/fresh.ts";
import {
	addPlanItem,
	addPlanNote,
	createPlan,
	deletePlanNote,
	editPlanNote,
	getPlan,
	getPlans,
	listDeletedPlanNotes,
	listPlanNoteRevisions,
	listPlanNotes,
	type PlanNote,
	type PlanPatchInput,
	type PlanWithCounts,
	removePlanItem,
	reorderPlanItems,
	restorePlanNote,
	type PlanStatus,
	type TextRevision,
	updatePlan,
} from "#lib/api/plans.ts";
import { getTasks } from "#lib/api/tasks.ts";
import { taskHref } from "#lib/navigation/href.ts";
import { planProgress } from "#lib/tasks/plan-progress.ts";
import type { Task } from "#lib/types.ts";
import { SvelteMap } from "svelte/reactivity";

export type PlanStatusFilter = "all" | "active" | "closed";

export type PlanField = "key" | "name" | "description";

const FILTER_STATUSES: Record<PlanStatusFilter, PlanStatus[] | undefined> = {
	all: undefined,
	active: ["backlog", "active"],
	closed: ["done", "cancelled"],
};

export function createPlanStore() {
	let plans = $state<PlanWithCounts[]>([]);
	let statusFilter = $state<PlanStatusFilter>("all");
	let query = $state("");
	let selectedId = $state<string | null>(null);
	let detail = $state<PlanWithCounts | null>(null);
	let items = $state<Task[]>([]);
	let candidates = $state<Task[]>([]);
	let planDocuments = $state<Document[]>([]);
	let allDocuments = $state<Document[]>([]);
	let notes = $state<PlanNote[]>([]);
	let deletedNotes = $state<PlanNote[]>([]);
	let revisions = $state<TextRevision[]>([]);
	let revisionNoteId = $state<string | null>(null);
	const noteDrafts = $state<Record<string, string>>({});
	let editingNote = $state<string | null>(null);
	let editingVersion = $state<string | null>(null);
	let editDraft = $state("");
	let editedField = $state<PlanField | null>(null);
	let editPlanId = $state<string | null>(null);
	let fieldDraft = $state("");
	let fieldSaving = $state(false);
	let fieldFailed = $state(false);
	let selectedDocument = $state("");
	let dragKey = $state<string | null>(null);
	let loaded = $state(false);
	let failed = $state(false);
	let creating = $state(false);
	let createFailed = $state(false);
	let openFailed = $state(false);
	let statusSaving = $state(false);
	let statusFailed = $state(false);
	let itemFailed = $state(false);
	let reorderFailed = $state(false);
	let documentFailed = $state(false);
	let notesFailed = $state(false);
	let revisionsFailed = $state(false);

	const activeId = $derived(selectedId ?? plans[0]?.id ?? null);

	const tasksById = $derived.by(() => {
		const map = new SvelteMap<string, Task>();
		for (const task of [...candidates, ...items]) map.set(task.id, task);
		return map;
	});

	const documentsToLink = $derived(
		allDocuments.filter(
			(document) => !planDocuments.some((linked) => linked.id === document.id),
		),
	);

	const progress = $derived(planProgress(items));

	function notesFor(key: string): PlanNote[] {
		return notes.filter((note) => note.key === key);
	}

	function deletedNotesFor(key: string): PlanNote[] {
		return deletedNotes.filter((note) => note.key === key);
	}

	function linkFor(id: string): string | null {
		const task = tasksById.get(id);
		return task === undefined ? null : taskHref(task.project_id, id);
	}

	function keepSelectionVisible(): void {
		if (selectedId !== null && plans.some((plan) => plan.id === selectedId)) {
			return;
		}
		const next = plans[0]?.id ?? null;
		if (next === selectedId) return;
		selectedId = next;
		if (next === null) clearDetail();
	}

	async function reloadPlans(): Promise<void> {
		try {
			plans = await fetchFresh(
				getPlans({
					status: FILTER_STATUSES[statusFilter],
					q: query.trim() === "" ? undefined : query.trim(),
				}),
			);
			failed = false;
		} catch {
			failed = true;
		}
		loaded = true;
		keepSelectionVisible();
	}

	async function setStatusFilter(filter: PlanStatusFilter): Promise<void> {
		statusFilter = filter;
		await reloadPlans();
	}

	async function setQuery(value: string): Promise<void> {
		query = value;
		await reloadPlans();
	}

	async function changeStatus(status: PlanStatus): Promise<void> {
		if (detail === null || statusSaving || detail.status === status) return;
		const id = detail.id;
		const previous = detail.status;
		detail = { ...detail, status };
		plans = plans.map((plan) => (plan.id === id ? { ...plan, status } : plan));
		statusSaving = true;
		statusFailed = false;
		try {
			await updatePlan({ plan_id: id, patch: { status } });
			await reloadPlans();
		} catch {
			detail =
				detail !== null && detail.id === id
					? { ...detail, status: previous }
					: detail;
			plans = plans.map((plan) =>
				plan.id === id ? { ...plan, status: previous } : plan,
			);
			statusFailed = true;
		} finally {
			statusSaving = false;
		}
	}

	async function loadDetail(id: string): Promise<void> {
		try {
			const [plan, page, all, linked, docs, planNotes, oldNotes] =
				await Promise.all([
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
					fetchFresh(getPlanDocuments({ plan_id: id })),
					fetchFresh(getDocuments({})),
					fetchFresh(listPlanNotes({ plan_id: id })),
					fetchFresh(listDeletedPlanNotes({ plan_id: id })),
				]);
			detail = plan;
			if (editPlanId !== id) resetEdit();
			items = page.items;
			candidates = all.items;
			planDocuments = linked;
			allDocuments = docs;
			notes = planNotes;
			deletedNotes = oldNotes;
		} catch {
			failed = true;
		}
	}

	function clearDetail(): void {
		detail = null;
		items = [];
		resetEdit();
	}

	function resetEdit(): void {
		editedField = null;
		editPlanId = null;
		fieldDraft = "";
		fieldFailed = false;
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

	async function create(name: string): Promise<boolean> {
		const trimmed = name.trim();
		if (trimmed === "") return false;
		creating = true;
		try {
			const plan = await createPlan({ name: trimmed });
			createFailed = false;
			statusFilter = "all";
			query = "";
			selectedId = plan.id;
			await reloadPlans();
			return true;
		} catch {
			createFailed = true;
			return false;
		} finally {
			creating = false;
		}
	}

	async function open(id: string): Promise<boolean> {
		const trimmed = id.trim();
		if (trimmed === "") return false;
		try {
			const plan = await getPlan({ plan_id: trimmed });
			openFailed = false;
			statusFilter = "all";
			query = "";
			selectedId = plan.id;
			await reloadPlans();
			return true;
		} catch {
			openFailed = true;
			return false;
		}
	}

	function startEdit(field: PlanField): void {
		if (detail === null || detail.id !== activeId || fieldSaving) return;
		editedField = field;
		editPlanId = detail.id;
		fieldDraft = detail[field];
		fieldFailed = false;
	}

	function cancelEdit(): void {
		if (fieldSaving) return;
		resetEdit();
	}

	async function saveEdit(): Promise<void> {
		if (detail === null || editedField === null || fieldSaving) return;
		const id = detail.id;
		const field = editedField;
		const value = fieldDraft.trim();
		if (field !== "description" && value === "") {
			fieldFailed = true;
			return;
		}
		if (value === detail[field]) {
			resetEdit();
			return;
		}
		fieldSaving = true;
		fieldFailed = false;
		try {
			await updatePlan({ plan_id: id, patch: patchFor(field, value) });
			resetEdit();
			await reloadPlans();
			await loadDetail(id);
		} catch {
			fieldFailed = true;
		} finally {
			fieldSaving = false;
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

	async function changeDocuments(
		action: () => Promise<unknown>,
	): Promise<void> {
		if (detail === null) return;
		const id = detail.id;
		documentFailed = false;
		try {
			await action();
			await reloadPlans();
		} catch {
			documentFailed = true;
		}
		await loadDetail(id);
	}

	async function changeNotes(action: () => Promise<unknown>): Promise<void> {
		if (detail === null) return;
		const id = detail.id;
		notesFailed = false;
		revisionNoteId = null;
		revisions = [];
		try {
			await action();
		} catch {
			notesFailed = true;
		}
		await loadDetail(id);
	}

	async function showRevisions(noteId: string): Promise<void> {
		if (revisionNoteId === noteId) {
			revisionNoteId = null;
			revisions = [];
			return;
		}
		revisionNoteId = noteId;
		revisionsFailed = false;
		try {
			revisions = await fetchFresh(listPlanNoteRevisions({ note_id: noteId }));
		} catch {
			revisions = [];
			revisionsFailed = true;
		}
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

	return {
		get plans() {
			return plans;
		},
		get statusFilter() {
			return statusFilter;
		},
		get query() {
			return query;
		},
		get activeId() {
			return activeId;
		},
		get detail() {
			return detail;
		},
		get items() {
			return items;
		},
		get progress() {
			return progress;
		},
		get candidates() {
			return candidates;
		},
		get planDocuments() {
			return planDocuments;
		},
		get documentsToLink() {
			return documentsToLink;
		},
		get notes() {
			return notes;
		},
		get deletedNotes() {
			return deletedNotes;
		},
		get revisions() {
			return revisions;
		},
		get revisionNoteId() {
			return revisionNoteId;
		},
		get noteDrafts() {
			return noteDrafts;
		},
		get editingNote() {
			return editingNote;
		},
		get editingVersion() {
			return editingVersion;
		},
		get editDraft() {
			return editDraft;
		},
		get editedField() {
			return editedField;
		},
		get fieldDraft() {
			return fieldDraft;
		},
		get selectedDocument() {
			return selectedDocument;
		},
		get dragKey() {
			return dragKey;
		},
		get loaded() {
			return loaded;
		},
		get failed() {
			return failed;
		},
		get creating() {
			return creating;
		},
		get createFailed() {
			return createFailed;
		},
		get openFailed() {
			return openFailed;
		},
		get fieldSaving() {
			return fieldSaving;
		},
		get fieldFailed() {
			return fieldFailed;
		},
		get statusSaving() {
			return statusSaving;
		},
		get statusFailed() {
			return statusFailed;
		},
		get itemFailed() {
			return itemFailed;
		},
		get reorderFailed() {
			return reorderFailed;
		},
		get documentFailed() {
			return documentFailed;
		},
		get notesFailed() {
			return notesFailed;
		},
		get revisionsFailed() {
			return revisionsFailed;
		},

		select(id: string) {
			selectedId = id;
		},
		clearDetail,
		setDragKey(id: string | null) {
			dragKey = id;
		},
		setSelectedDocument(id: string) {
			selectedDocument = id;
		},
		setNoteDraft(id: string, body: string) {
			noteDrafts[id] = body;
		},
		setEditDraft(body: string) {
			editDraft = body;
		},
		setFieldDraft(value: string) {
			fieldDraft = value;
		},
		startEditNote(note: PlanNote) {
			editingNote = note.id;
			editingVersion = note.edited_at ?? note.created_at;
			editDraft = note.body;
		},
		cancelEditNote() {
			editingNote = null;
			editingVersion = null;
		},
		startEdit,
		cancelEdit,
		saveEdit,
		notesFor,
		deletedNotesFor,
		linkFor,
		reloadPlans,
		setStatusFilter,
		setQuery,
		changeStatus,
		loadDetail,
		create,
		open,
		addItem(planId: string, id: string) {
			return changeItems(() => addPlanItem({ plan_id: planId, task_id: id }));
		},
		removeItem(planId: string, id: string) {
			return changeItems(() =>
				removePlanItem({ plan_id: planId, task_id: id }),
			);
		},
		linkDocument(planId: string, id: string) {
			return changeDocuments(() =>
				linkDocumentToPlan({ plan_id: planId, document_id: id }),
			);
		},
		unlinkDocument(planId: string, id: string) {
			return changeDocuments(() =>
				unlinkDocumentFromPlan({ plan_id: planId, document_id: id }),
			);
		},
		async addNote(planId: string, taskId: string, body: string) {
			const trimmed = body.trim();
			if (trimmed === "") return;
			noteDrafts[taskId] = "";
			await changeNotes(() =>
				addPlanNote({ plan_id: planId, task_id: taskId, body: trimmed }),
			);
		},
		async editNote(noteId: string, body: string, version: string | null) {
			const trimmed = body.trim();
			if (trimmed === "") return;
			const editing = editingNote;
			editingNote = null;
			editingVersion = null;
			if (editing !== noteId) return;
			await changeNotes(() =>
				editPlanNote({
					note_id: noteId,
					body: trimmed,
					expected_edited_at: version,
				}),
			);
		},
		removeNote(noteId: string) {
			return changeNotes(() => deletePlanNote({ note_id: noteId }));
		},
		restoreNote(noteId: string) {
			return changeNotes(() => restorePlanNote({ note_id: noteId }));
		},
		showRevisions,
		moveItem,
	};
}

export type PlanStore = ReturnType<typeof createPlanStore>;
