import {
	createDocument as createDocumentRemote,
	deleteDocument as deleteDocumentRemote,
	restoreDocument as restoreDocumentRemote,
	updateDocument as updateDocumentRemote,
	type Document,
	type DocumentPatchInput,
	type NewDocumentInput,
} from "#lib/api/documents.ts";
import type { ProjectFilter } from "#lib/types.ts";

function sortDocuments(documents: Document[]): Document[] {
	return [...documents].sort(
		(left, right) =>
			left.project_id.localeCompare(right.project_id) ||
			left.key.localeCompare(right.key, undefined, { numeric: true }),
	);
}

export function createDocumentStore(initial: Document[]) {
	let documents = $state(sortDocuments(initial));

	const byProject = $derived.by(() => {
		const map: Record<string, Document[]> = {};
		for (const document of documents) {
			(map[document.project_id] ??= []).push(document);
		}
		return map;
	});

	function replace(updated: Document) {
		documents = sortDocuments(
			documents.map((document) =>
				document.id === updated.id ? updated : document,
			),
		);
	}

	return {
		get all() {
			return documents;
		},
		get byProject() {
			return byProject;
		},
		replaceAll(next: Document[]) {
			documents = sortDocuments(next);
		},
		listFor(projectId: ProjectFilter) {
			return projectId === null ? documents : (byProject[projectId] ?? []);
		},
		hasProject(projectId: string) {
			return (byProject[projectId]?.length ?? 0) > 0;
		},
		async create(input: NewDocumentInput) {
			const document = await createDocumentRemote(input);
			documents = sortDocuments([...documents, document]);
			return document;
		},
		async update(input: DocumentPatchInput) {
			const updated = await updateDocumentRemote(input);
			replace(updated);
			return updated;
		},
		async destroy(id: string) {
			await deleteDocumentRemote({ document_id: id });
			documents = documents.filter((document) => document.id !== id);
		},
		async restore(document: Document) {
			const restored = await restoreDocumentRemote({
				document_id: document.id,
			});
			documents = sortDocuments([...documents, restored]);
			return restored;
		},
	};
}

export type DocumentStore = ReturnType<typeof createDocumentStore>;
