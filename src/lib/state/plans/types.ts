import type { Document } from "#lib/api/plans/documents.ts";
import type {
	Plan,
	PlanNote,
	PlanWithCounts,
	TextRevision,
} from "#lib/api/plans/plans.ts";
import type { Task } from "#lib/types.ts";

export type PlanStatusFilter = "all" | "active" | "closed";

export type PlanField = "key" | "name" | "description";

export interface PlansState {
	plans: PlanWithCounts[];
	deletedPlans: Plan[];
	showDeleted: boolean;
	deletedLoaded: boolean;
	statusFilter: PlanStatusFilter;
	query: string;
	selectedId: string | null;
	detail: PlanWithCounts | null;
	detailRevision: number;
	items: Task[];
	candidates: Task[];
	planDocuments: Document[];
	allDocuments: Document[];
	notes: PlanNote[];
	deletedNotes: PlanNote[];
	revisions: TextRevision[];
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
