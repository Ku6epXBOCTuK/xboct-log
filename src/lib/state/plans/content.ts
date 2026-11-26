import {
	linkDocumentToPlan,
	unlinkDocumentFromPlan,
	type Document,
} from "#lib/api/plans/documents.ts";
import { fetchFresh } from "#lib/api/fresh.ts";
import {
	addPlanItem,
	addPlanNote,
	deletePlanNote,
	editPlanNote,
	listPlanNoteRevisions,
	removePlanItem,
	reorderPlanItems,
	restorePlanNote,
	type PlanNote,
} from "#lib/api/plans/plans.ts";
import type { PlansState } from "./types.ts";

export function createPlanContent(
	state: PlansState,
	deps: {
		loadDetail: (id: string) => Promise<void>;
		onMutate?: () => void;
	},
) {
	async function changeItems(action: () => Promise<unknown>): Promise<void> {
		if (state.detail === null) return;
		const id = state.detail.id;
		state.itemFailed = false;
		try {
			await action();
			deps.onMutate?.();
		} catch {
			state.itemFailed = true;
		}
		await deps.loadDetail(id);
	}

	async function changeDocuments(
		action: () => Promise<Document>,
		apply: (document: Document) => void,
	): Promise<void> {
		if (state.detail === null) return;
		state.documentFailed = false;
		try {
			const document = await action();
			apply(document);
			deps.onMutate?.();
		} catch {
			state.documentFailed = true;
		}
	}

	async function changeNotes(
		action: () => Promise<PlanNote>,
		apply: (note: PlanNote) => void,
	): Promise<void> {
		if (state.detail === null) return;
		state.notesFailed = false;
		state.revisionNoteId = null;
		state.revisions = [];
		try {
			const note = await action();
			apply(note);
			deps.onMutate?.();
		} catch {
			state.notesFailed = true;
		}
	}

	async function showRevisions(noteId: string): Promise<void> {
		if (state.revisionNoteId === noteId) {
			state.revisionNoteId = null;
			state.revisions = [];
			return;
		}
		state.revisionNoteId = noteId;
		state.revisionsFailed = false;
		try {
			state.revisions = await fetchFresh(
				listPlanNoteRevisions({ note_id: noteId }),
			);
		} catch {
			state.revisions = [];
			state.revisionsFailed = true;
		}
	}

	async function moveItem(target: string): Promise<void> {
		const source = state.dragKey;
		state.dragKey = null;
		if (source === null || source === target || state.detail === null) return;

		const from = state.items.findIndex((item) => item.id === source);
		const to = state.items.findIndex((item) => item.id === target);
		if (from < 0 || to < 0) return;

		const next = [...state.items];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		state.items = next;
		state.reorderFailed = false;

		try {
			await reorderPlanItems({
				plan_id: state.detail.id,
				task_ids: next.map((item) => item.id),
			});
			deps.onMutate?.();
		} catch {
			state.reorderFailed = true;
			await deps.loadDetail(state.detail.id);
		}
	}

	return {
		showRevisions,
		moveItem,
		addItem(planId: string, id: string) {
			return changeItems(() => addPlanItem({ plan_id: planId, task_id: id }));
		},
		removeItem(planId: string, id: string) {
			return changeItems(() =>
				removePlanItem({ plan_id: planId, task_id: id }),
			);
		},
		linkDocument(planId: string, id: string) {
			return changeDocuments(
				() => linkDocumentToPlan({ plan_id: planId, document_id: id }),
				(document) => {
					state.planDocuments = [...state.planDocuments, document];
				},
			);
		},
		unlinkDocument(planId: string, id: string) {
			return changeDocuments(
				() => unlinkDocumentFromPlan({ plan_id: planId, document_id: id }),
				(document) => {
					state.planDocuments = state.planDocuments.filter(
						(item) => item.id !== document.id,
					);
				},
			);
		},
		async addNote(planId: string, taskId: string, body: string) {
			const trimmed = body.trim();
			if (trimmed === "") return;
			state.noteDrafts[taskId] = "";
			await changeNotes(
				() => addPlanNote({ plan_id: planId, task_id: taskId, body: trimmed }),
				(note) => {
					state.notes = [...state.notes, note];
				},
			);
		},
		async editNote(noteId: string, body: string, version: string | null) {
			const trimmed = body.trim();
			if (trimmed === "") return;
			const editing = state.editingNote;
			state.editingNote = null;
			state.editingVersion = null;
			if (editing !== noteId) return;
			await changeNotes(
				() =>
					editPlanNote({
						note_id: noteId,
						body: trimmed,
						expected_edited_at: version,
					}),
				(note) => {
					state.notes = state.notes.map((item) =>
						item.id === note.id ? note : item,
					);
				},
			);
		},
		removeNote(noteId: string) {
			return changeNotes(
				() => deletePlanNote({ note_id: noteId }),
				(note) => {
					state.notes = state.notes.filter((item) => item.id !== note.id);
					state.deletedNotes = [...state.deletedNotes, note];
				},
			);
		},
		restoreNote(noteId: string) {
			return changeNotes(
				() => restorePlanNote({ note_id: noteId }),
				(note) => {
					state.deletedNotes = state.deletedNotes.filter(
						(item) => item.id !== note.id,
					);
					state.notes = [...state.notes, note];
				},
			);
		},
	};
}
