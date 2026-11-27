import type { Document } from "#lib/api/plans/documents.ts";
import type {
	Plan,
	PlanNote,
	PlanWithCounts,
	TextRevision,
} from "#lib/api/plans/plans.ts";
import type { DataCell, EntityCollection } from "#lib/data/data.svelte.ts";
import type { Task } from "#lib/types.ts";

export type PlanStatusFilter = "all" | "active" | "closed";

export type PlanField = "key" | "name" | "description";

export interface PlanData {
	plans: EntityCollection<PlanWithCounts>;
	deleted: EntityCollection<Plan>;
	listIds: DataCell<string[]>;
	deletedIds: DataCell<string[]>;
	items: DataCell<Task[]>;
	candidates: DataCell<Task[]>;
	planDocuments: DataCell<Document[]>;
	allDocuments: DataCell<Document[]>;
	notes: DataCell<PlanNote[]>;
	deletedNotes: DataCell<PlanNote[]>;
	revisions: DataCell<TextRevision[]>;
}

export interface PlansState {
	showDeleted: boolean;
	deletedLoaded: boolean;
	statusFilter: PlanStatusFilter;
	query: string;
	selectedId: string | null;
	revisionNoteId: string | null;
	noteDrafts: Record<string, string>;
	editingNote: string | null;
	editingVersion: string | null;
	editDraft: string;
	editedField: PlanField | null;
	editPlanId: string | null;
	fieldDraft: string;
	fieldSaving: boolean;
	fieldFailed: boolean;
	selectedDocument: string;
	dragKey: string | null;
	loaded: boolean;
	failed: boolean;
	creating: boolean;
	createFailed: boolean;
	openFailed: boolean;
	statusSaving: boolean;
	statusFailed: boolean;
	itemFailed: boolean;
	reorderFailed: boolean;
	documentFailed: boolean;
	notesFailed: boolean;
	revisionsFailed: boolean;
	deletedFailed: boolean;
	deleting: boolean;
	deleteFailed: boolean;
	restoringId: string | null;
	restoreFailed: boolean;
}
