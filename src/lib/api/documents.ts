import { client, unwrap } from "./client.ts";
import type { components } from "./schema.d.ts";

export type Document = components["schemas"]["Document"];
export type DocumentKind = components["schemas"]["DocumentKind"];
export type DocumentStatus = components["schemas"]["DocumentStatus"];
export type TextRevision = components["schemas"]["TextRevision"];

export interface NewDocumentInput {
	project_id: string;
	kind: DocumentKind;
	title: string;
	body?: string | null;
	source_file?: string | null;
}

export interface DocumentPatchInput {
	document_id: string;
	patch?: {
		kind?: DocumentKind;
		title?: string;
		body?: string;
		status?: DocumentStatus;
		source_file?: string | null;
	};
	expected_updated_at?: string | null;
}

export interface DocumentListInput {
	project_id?: string | string[];
	kind?: DocumentKind | DocumentKind[];
	status?: DocumentStatus | DocumentStatus[];
	q?: string;
	title?: string;
	title_exact?: string;
	source_file?: string;
	sort?:
		| "number"
		| "key"
		| "title"
		| "kind"
		| "status"
		| "created_at"
		| "updated_at"
		| "closed_at";
	order?: "asc" | "desc";
	deleted_only?: boolean;
	fields?: string | string[];
	include_deleted?: boolean;
	limit?: number;
	offset?: number;
}

export async function getDocuments(
	input: DocumentListInput = {},
): Promise<Document[]> {
	const answer = await client.POST("/api/documents_list", {
		body: { ...input, include_body: true, limit: 1000 },
	});
	return unwrap<{ items: Document[] }>(answer).items;
}

export async function getDocument(input: {
	document_id: string;
}): Promise<Document> {
	return unwrap<Document>(
		await client.POST("/api/documents_get", { body: input }),
	);
}

export async function getDeletedDocuments(): Promise<Document[]> {
	const answer = await client.POST("/api/documents_deleted_list", { body: {} });
	return unwrap<{ items: Document[] }>(answer).items;
}

export async function createDocument(
	input: NewDocumentInput,
): Promise<Document> {
	return unwrap<Document>(
		await client.POST("/api/documents_create", { body: input }),
	);
}

export async function updateDocument(
	input: DocumentPatchInput,
): Promise<Document> {
	return unwrap<Document>(
		await client.POST("/api/documents_update", { body: input }),
	);
}

export async function deleteDocument(input: {
	document_id: string;
}): Promise<Document> {
	return unwrap<Document>(
		await client.POST("/api/documents_delete", { body: input }),
	);
}

export async function restoreDocument(input: {
	document_id: string;
}): Promise<Document> {
	return unwrap<Document>(
		await client.POST("/api/documents_restore", { body: input }),
	);
}

export async function getDocumentRevisions(input: {
	document_id: string;
}): Promise<TextRevision[]> {
	const answer = await client.POST("/api/documents_revisions_list", {
		body: input,
	});
	return unwrap<{ items: TextRevision[] }>(answer).items;
}

export async function getPlanDocuments(
	input: { plan_id: string } & DocumentListInput,
): Promise<Document[]> {
	const answer = await client.POST("/api/plans_documents_list", {
		body: { ...input, include_body: true, limit: 1000 },
	});
	return unwrap<{ items: Document[] }>(answer).items;
}

export async function linkDocumentToPlan(input: {
	plan_id: string;
	document_id: string;
}): Promise<Document> {
	return unwrap<Document>(
		await client.POST("/api/plans_documents_link", { body: input }),
	);
}

export async function unlinkDocumentFromPlan(input: {
	plan_id: string;
	document_id: string;
}): Promise<Document> {
	return unwrap<Document>(
		await client.POST("/api/plans_documents_unlink", { body: input }),
	);
}
