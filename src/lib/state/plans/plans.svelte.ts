import { SvelteMap } from "svelte/reactivity";
import type { PlanNote } from "#lib/api/plans/plans.ts";
import { taskHref } from "#lib/navigation/href.ts";
import { planProgress } from "#lib/tasks/progress/plan-progress.ts";
import type { Task } from "#lib/types.ts";
import { createPlanContent } from "./content.ts";
import { createPlanDetail } from "./detail.ts";
import { createPlanList } from "./list.ts";
import type { PlansState } from "./types.ts";

export type { PlanField, PlanStatusFilter } from "./types.ts";

export function createPlanStore(onMutate?: () => void) {
	const state = $state<PlansState>({
		plans: [],
		deletedPlans: [],
		showDeleted: false,
		deletedLoaded: false,
		statusFilter: "active",
		query: "",
		selectedId: null,
		detail: null,
		detailRevision: 0,
		items: [],
		candidates: [],
		planDocuments: [],
		allDocuments: [],
		notes: [],
		deletedNotes: [],
		revisions: [],
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

	const activeId = $derived(state.selectedId ?? state.plans[0]?.id ?? null);

	const tasksById = $derived.by(() => {
		const map = new SvelteMap<string, Task>();
		for (const task of [...state.candidates, ...state.items])
			map.set(task.id, task);
		return map;
	});

	const documentsToLink = $derived(
		state.allDocuments.filter(
			(document) =>
				!state.planDocuments.some((linked) => linked.id === document.id),
		),
	);

	const progress = $derived(planProgress(state.items));

	const detail = createPlanDetail(state, onMutate);
	const list = createPlanList(state, {
		clearDetail: detail.clearDetail,
		onMutate,
	});
	const content = createPlanContent(state, {
		loadDetail: detail.loadDetail,
		onMutate,
	});

	function notesFor(key: string) {
		return state.notes.filter((note) => note.key === key);
	}

	function deletedNotesFor(key: string) {
		return state.deletedNotes.filter((note) => note.key === key);
	}

	function linkFor(id: string): string | null {
		const task = tasksById.get(id);
		return task === undefined ? null : taskHref(task.project_id, id);
	}

	const store = {
		get plans() {
			return state.plans;
		},
		get deletedPlans() {
			return state.deletedPlans;
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
			return state.detail;
		},
		get items() {
			return state.items;
		},
		get progress() {
			return progress;
		},
		get candidates() {
			return state.candidates;
		},
		get planDocuments() {
			return state.planDocuments;
		},
		get documentsToLink() {
			return documentsToLink;
		},
		get notes() {
			return state.notes;
		},
		get deletedNotes() {
			return state.deletedNotes;
		},
		get revisions() {
			return state.revisions;
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
		clearDetail: detail.clearDetail,
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
		startEdit: detail.startEdit,
		cancelEdit: detail.cancelEdit,
		saveEdit: detail.saveEdit,
		notesFor,
		deletedNotesFor,
		linkFor,
		reloadPlans: list.reloadPlans,
		reloadDeletedPlans: list.reloadDeletedPlans,
		setShowDeleted: list.setShowDeleted,
		deleteActive: list.deleteActive,
		restore: list.restore,
		setStatusFilter: list.setStatusFilter,
		setQuery: list.setQuery,
		changeStatus: detail.changeStatus,
		loadDetail: detail.loadDetail,
		create: list.create,
		open: list.open,
		addItem: content.addItem,
		removeItem: content.removeItem,
		linkDocument: content.linkDocument,
		unlinkDocument: content.unlinkDocument,
		addNote: content.addNote,
		editNote: content.editNote,
		removeNote: content.removeNote,
		restoreNote: content.restoreNote,
		showRevisions: content.showRevisions,
		moveItem: content.moveItem,
	};

	return store;
}

export type PlanStore = ReturnType<typeof createPlanStore>;
