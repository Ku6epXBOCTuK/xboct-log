import { SvelteMap } from "svelte/reactivity";
import type { Document } from "#lib/api/plans/documents.ts";
import type {
	Plan,
	PlanNote,
	PlanWithCounts,
	TextRevision,
} from "#lib/api/plans/plans.ts";
import { data } from "#lib/data/data.svelte.ts";
import { taskHref } from "#lib/navigation/href.ts";
import { planProgress } from "#lib/tasks/progress/plan-progress.ts";
import type { Task } from "#lib/types.ts";
import { createPlanContent } from "./content.ts";
import { createPlanDetail } from "./detail.ts";
import { mergePlan } from "./helpers.ts";
import { createPlanList } from "./list.ts";
import type { PlanData, PlansState } from "./types.ts";

export type { PlanField, PlanStatusFilter } from "./types.ts";

export function createPlanStore(onMutate?: () => void) {
	const state = $state<PlansState>({
		showDeleted: false,
		deletedLoaded: false,
		statusFilter: "active",
		query: "",
		selectedId: null,
		revisionNoteId: null,
		noteDrafts: {},
		editingNote: null,
		editingVersion: null,
		editDraft: "",
		editedField: null,
		editPlanId: null,
		fieldDraft: "",
		fieldSaving: false,
		fieldFailed: false,
		selectedDocument: "",
		dragKey: null,
		loaded: false,
		failed: false,
		creating: false,
		createFailed: false,
		openFailed: false,
		statusSaving: false,
		statusFailed: false,
		itemFailed: false,
		reorderFailed: false,
		documentFailed: false,
		notesFailed: false,
		revisionsFailed: false,
		deletedFailed: false,
		deleting: false,
		deleteFailed: false,
		restoringId: null,
		restoreFailed: false,
	});

	const store: PlanData = {
		plans: data.entities<PlanWithCounts>("plans", mergePlan),
		deleted: data.entities<Plan>("plans:deleted"),
		listIds: data.cell<string[]>("plans:ids", []),
		deletedIds: data.cell<string[]>("plans:deleted:ids", []),
		items: data.cell<Task[]>("detail:items", []),
		candidates: data.cell<Task[]>("detail:candidates", []),
		planDocuments: data.cell<Document[]>("detail:documents", []),
		allDocuments: data.cell<Document[]>("detail:all-documents", []),
		notes: data.cell<PlanNote[]>("detail:notes", []),
		deletedNotes: data.cell<PlanNote[]>("detail:deleted-notes", []),
		revisions: data.cell<TextRevision[]>("detail:revisions", []),
	};

	const activeId = $derived(state.selectedId ?? store.listIds.value[0] ?? null);

	const plans = $derived(
		store.listIds.value
			.map((id) => store.plans.get(id))
			.filter((plan): plan is PlanWithCounts => plan !== undefined),
	);

	const deletedPlans = $derived(
		store.deletedIds.value
			.map((id) => store.deleted.get(id))
			.filter((plan): plan is Plan => plan !== undefined),
	);

	const detail = $derived(
		activeId === null ? null : (store.plans.get(activeId) ?? null),
	);

	const tasksById = $derived.by(() => {
		const map = new SvelteMap<string, Task>();
		for (const task of [...store.candidates.value, ...store.items.value])
			map.set(task.id, task);
		return map;
	});

	const documentsToLink = $derived(
		store.allDocuments.value.filter(
			(document) =>
				!store.planDocuments.value.some((linked) => linked.id === document.id),
		),
	);

	const progress = $derived(planProgress(store.items.value));

	const detailStore = createPlanDetail(state, store, onMutate);
	const listStore = createPlanList(state, store, {
		clearDetail: detailStore.clearDetail,
		onMutate,
	});
	const contentStore = createPlanContent(state, store, {
		loadDetail: detailStore.loadDetail,
		onMutate,
	});

	function loadDetail(id: string, force = false): Promise<void> {
		return detailStore.loadDetail(id, force);
	}

	function notesFor(key: string): PlanNote[] {
		return store.notes.value.filter((note) => note.key === key);
	}

	function deletedNotesFor(key: string): PlanNote[] {
		return store.deletedNotes.value.filter((note) => note.key === key);
	}

	function linkFor(id: string): string | null {
		const task = tasksById.get(id);
		return task === undefined ? null : taskHref(task.project_id, id);
	}

	const result = {
		get plans() {
			return plans;
		},
		get deletedPlans() {
			return deletedPlans;
		},
		get showDeleted() {
			return state.showDeleted;
		},
		get deletedLoaded() {
			return state.deletedLoaded;
		},
		get deletedFailed() {
			return state.deletedFailed;
		},
		get statusFilter() {
			return state.statusFilter;
		},
		get query() {
			return state.query;
		},
		get activeId() {
			return activeId;
		},
		get detail() {
			return detail;
		},
		get items() {
			return store.items.value;
		},
		get progress() {
			return progress;
		},
		get candidates() {
			return store.candidates.value;
		},
		get planDocuments() {
			return store.planDocuments.value;
		},
		get documentsToLink() {
			return documentsToLink;
		},
		get notes() {
			return store.notes.value;
		},
		get deletedNotes() {
			return store.deletedNotes.value;
		},
		get revisions() {
			return store.revisions.value;
		},
		get revisionNoteId() {
			return state.revisionNoteId;
		},
		get noteDrafts() {
			return state.noteDrafts;
		},
		get editingNote() {
			return state.editingNote;
		},
		get editingVersion() {
			return state.editingVersion;
		},
		get editDraft() {
			return state.editDraft;
		},
		get editedField() {
			return state.editedField;
		},
		get fieldDraft() {
			return state.fieldDraft;
		},
		get selectedDocument() {
			return state.selectedDocument;
		},
		get dragKey() {
			return state.dragKey;
		},
		get loaded() {
			return state.loaded;
		},
		get failed() {
			return state.failed;
		},
		get deleting() {
			return state.deleting;
		},
		get deleteFailed() {
			return state.deleteFailed;
		},
		get restoringId() {
			return state.restoringId;
		},
		get restoreFailed() {
			return state.restoreFailed;
		},
		get creating() {
			return state.creating;
		},
		get createFailed() {
			return state.createFailed;
		},
		get openFailed() {
			return state.openFailed;
		},
		get fieldSaving() {
			return state.fieldSaving;
		},
		get fieldFailed() {
			return state.fieldFailed;
		},
		get statusSaving() {
			return state.statusSaving;
		},
		get statusFailed() {
			return state.statusFailed;
		},
		get itemFailed() {
			return state.itemFailed;
		},
		get reorderFailed() {
			return state.reorderFailed;
		},
		get documentFailed() {
			return state.documentFailed;
		},
		get notesFailed() {
			return state.notesFailed;
		},
		get revisionsFailed() {
			return state.revisionsFailed;
		},

		select(id: string) {
			state.selectedId = id;
		},
		clearDetail: detailStore.clearDetail,
		setDragKey(id: string | null) {
			state.dragKey = id;
		},
		setSelectedDocument(id: string) {
			state.selectedDocument = id;
		},
		setNoteDraft(id: string, body: string) {
			state.noteDrafts[id] = body;
		},
		setEditDraft(body: string) {
			state.editDraft = body;
		},
		setFieldDraft(value: string) {
			state.fieldDraft = value;
		},
		startEditNote(note: PlanNote) {
			state.editingNote = note.id;
			state.editingVersion = note.edited_at ?? note.created_at;
			state.editDraft = note.body;
		},
		cancelEditNote() {
			state.editingNote = null;
			state.editingVersion = null;
		},
		startEdit: detailStore.startEdit,
		cancelEdit: detailStore.cancelEdit,
		saveEdit: detailStore.saveEdit,
		notesFor,
		deletedNotesFor,
		linkFor,
		reloadPlans: listStore.reloadPlans,
		reloadDeletedPlans: listStore.reloadDeletedPlans,
		setShowDeleted: listStore.setShowDeleted,
		deleteActive: listStore.deleteActive,
		restore: listStore.restore,
		setStatusFilter: listStore.setStatusFilter,
		setQuery: listStore.setQuery,
		changeStatus: detailStore.changeStatus,
		loadDetail,
		create: listStore.create,
		open: listStore.open,
		addItem: contentStore.addItem,
		removeItem: contentStore.removeItem,
		linkDocument: contentStore.linkDocument,
		unlinkDocument: contentStore.unlinkDocument,
		addNote: contentStore.addNote,
		editNote: contentStore.editNote,
		removeNote: contentStore.removeNote,
		restoreNote: contentStore.restoreNote,
		showRevisions: contentStore.showRevisions,
		moveItem: contentStore.moveItem,
	};

	return result;
}

export type PlanStore = ReturnType<typeof createPlanStore>;
