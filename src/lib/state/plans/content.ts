import { fetchFresh } from "#lib/api/fresh.ts";
import {
	type Document,
	linkDocumentToPlan,
	unlinkDocumentFromPlan,
} from "#lib/api/plans/documents.ts";
import {
	addPlanItem,
	addPlanNote,
	deletePlanNote,
	editPlanNote,
	listPlanNoteRevisions,
	type PlanNote,
	removePlanItem,
	reorderPlanItems,
	restorePlanNote,
} from "#lib/api/plans/plans.ts";
import { data, dataKey } from "#lib/data/data.svelte.ts";
import type { PlanData, PlansState } from "./types.ts";

export function createPlanContent(
	state: PlansState,
	store: PlanData,
	deps: {
		loadDetail: (id: string, force?: boolean) => Promise<void>;
		onMutate?: () => void;
	},
) {
	function detailId(): string | null {
		const id = state.selectedId ?? store.listIds.value[0] ?? null;
		return id === null ? null : store.plans.get(id) === undefined ? null : id;
	}

	async function changeItems(action: () => Promise<unknown>): Promise<void> {
		const id = detailId();
		if (id === null) return;
		state.itemFailed = false;
		try {
			await action();
			deps.onMutate?.();
		} catch {
			state.itemFailed = true;
		}
		await deps.loadDetail(id, true);
	}

	async function changeDocuments(
		action: () => Promise<Document>,
		apply: (document: Document) => void,
	): Promise<void> {
		if (detailId() === null) return;
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
		if (detailId() === null) return;
		state.notesFailed = false;
		state.revisionNoteId = null;
		store.revisions.set([]);
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
			store.revisions.set([]);
			return;
		}
		state.revisionNoteId = noteId;
		state.revisionsFailed = false;
		try {
			await data.load(
				dataKey("detail", "revisions", noteId),
				() => fetchFresh(listPlanNoteRevisions({ note_id: noteId })),
				(revisions) => store.revisions.set(revisions),
			);
		} catch {
			store.revisions.set([]);
			state.revisionsFailed = true;
		}
	}

	async function moveItem(target: string): Promise<void> {
		const source = state.dragKey;
		state.dragKey = null;
		const id = detailId();
		if (source === null || source === target || id === null) return;

		const items = store.items.value;
		const from = items.findIndex((item) => item.id === source);
		const to = items.findIndex((item) => item.id === target);
		if (from < 0 || to < 0) return;

		const next = [...items];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		store.items.set(next);
		state.reorderFailed = false;

		try {
			await reorderPlanItems({
				plan_id: id,
				task_ids: next.map((item) => item.id),
			});
			deps.onMutate?.();
		} catch {
			state.reorderFailed = true;
			await deps.loadDetail(id, true);
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
					store.planDocuments.set([...store.planDocuments.value, document]);
				},
			);
		},
		unlinkDocument(planId: string, id: string) {
			return changeDocuments(
				() => unlinkDocumentFromPlan({ plan_id: planId, document_id: id }),
				(document) => {
					store.planDocuments.set(
						store.planDocuments.value.filter((item) => item.id !== document.id),
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
					store.notes.set([...store.notes.value, note]);
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
					store.notes.set(
						store.notes.value.map((item) =>
							item.id === note.id ? note : item,
						),
					);
				},
			);
		},
		removeNote(noteId: string) {
			return changeNotes(
				() => deletePlanNote({ note_id: noteId }),
				(note) => {
					store.notes.set(
						store.notes.value.filter((item) => item.id !== note.id),
					);
					store.deletedNotes.set([...store.deletedNotes.value, note]);
				},
			);
		},
		restoreNote(noteId: string) {
			return changeNotes(
				() => restorePlanNote({ note_id: noteId }),
				(note) => {
					store.deletedNotes.set(
						store.deletedNotes.value.filter((item) => item.id !== note.id),
					);
					store.notes.set([...store.notes.value, note]);
				},
			);
		},
	};
}
