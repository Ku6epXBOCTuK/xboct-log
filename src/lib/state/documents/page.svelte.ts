import { fetchFresh } from "#lib/api/fresh.ts";
import {
	type Document,
	type DocumentKind,
	type DocumentStatus,
	getDocumentRevisions,
	getDocuments,
	type TextRevision,
} from "#lib/api/plans/documents.ts";
import { data, dataKey } from "#lib/data/data.svelte.ts";
import { createDocumentStore } from "#lib/state/workspace/documents.svelte.ts";
import type { ProjectFilter } from "#lib/types.ts";

const KINDS: DocumentKind[] = [
	"adr",
	"prd",
	"architecture",
	"research",
	"workflow",
	"guide",
	"spec",
];
const STATUSES: DocumentStatus[] = [
	"draft",
	"accepted",
	"superseded",
	"archived",
];

export interface DocumentPageOptions {
	project: () => ProjectFilter;
	initialDocumentId?: () => string | undefined;
}

export function createDocumentPage({
	project,
	initialDocumentId,
}: DocumentPageOptions) {
	const store = createDocumentStore([]);
	const form = $state<{ title: string; kind: DocumentKind }>({
		title: "",
		kind: "adr",
	});
	const draft = $state({ body: "" });
	let loaded = $state(false);
	let failed = $state(false);
	let appliedInitialId = $state<string | null>(null);
	let selectedId = $state<string | null>(null);
	let detail = $state<Document | null>(null);
	let revisions = $state<TextRevision[]>([]);
	let saving = $state(false);
	let failedDetail = $state(false);
	let creating = $state(false);

	const documents = $derived(store.listFor(project()));
	const dirty = $derived(detail !== null && draft.body !== detail.body);

	async function reload(): Promise<void> {
		const current = project();
		const initial = initialDocumentId?.();
		try {
			await data.load(
				dataKey("documents", "list", current ?? ""),
				() => fetchFresh(getDocuments({ project_id: current ?? undefined })),
				(items) => {
					store.replaceAll(items);
					if (
						initial !== undefined &&
						appliedInitialId !== initial &&
						items.some(
							(item) => item.id === initial && item.project_id === current,
						)
					) {
						selectedId = initial;
						appliedInitialId = initial;
					}
					failed = false;
				},
				true,
			);
		} catch {
			failed = true;
		}
		loaded = true;
	}

	async function reloadRevisions(id: string): Promise<void> {
		try {
			await data.load(
				dataKey("documents", "revisions", id),
				() => fetchFresh(getDocumentRevisions({ document_id: id })),
				(value) => {
					revisions = value;
				},
				true,
			);
		} catch {
			failedDetail = true;
		}
	}

	async function loadDetail(id: string): Promise<void> {
		try {
			await data.load(
				dataKey("documents", "detail", id),
				() => fetchFresh(getDocuments({ project_id: project() ?? undefined })),
				(documents) => {
					const found = documents.find((item) => item.id === id) ?? null;
					detail = found;
					draft.body = found?.body ?? "";
					failedDetail = false;
				},
				true,
			);
			await reloadRevisions(id);
		} catch {
			failedDetail = true;
		}
	}

	function clearDetail(): void {
		detail = null;
		revisions = [];
	}

	async function submitNew(): Promise<void> {
		const title = form.title.trim();
		const current = project();
		if (title === "" || current === null) return;
		creating = true;
		try {
			const document = await store.create({
				project_id: current,
				kind: form.kind,
				title,
			});
			form.title = "";
			selectedId = document.id;
			failedDetail = false;
			await reload();
		} catch {
			failed = true;
		} finally {
			creating = false;
		}
	}

	async function save(): Promise<void> {
		if (detail === null || !dirty) return;
		saving = true;
		try {
			const updated = await store.update({
				document_id: detail.id,
				patch: { body: draft.body },
				expected_updated_at: detail.updated_at,
			});
			detail = updated;
			data.touch(dataKey("documents", "detail", updated.id));
			failedDetail = false;
			await reloadRevisions(updated.id);
		} catch {
			failedDetail = true;
		} finally {
			saving = false;
		}
	}

	async function setStatus(status: DocumentStatus): Promise<void> {
		if (detail === null) return;
		try {
			detail = await store.update({
				document_id: detail.id,
				patch: { status },
				expected_updated_at: detail.updated_at,
			});
			data.touch(dataKey("documents", "detail", detail.id));
			failedDetail = false;
		} catch {
			failedDetail = true;
		}
	}

	async function toggleDelete(document: Document): Promise<void> {
		try {
			if (document.deleted_at === null) {
				await store.destroy(document.id);
				if (selectedId === document.id) {
					selectedId = null;
					clearDetail();
				}
			} else {
				await store.restore(document);
			}
			failed = false;
		} catch {
			failed = true;
		}
	}

	return {
		get documents() {
			return documents;
		},
		get kinds() {
			return KINDS;
		},
		get statuses() {
			return STATUSES;
		},
		get form() {
			return form;
		},
		get draft() {
			return draft;
		},
		get loaded() {
			return loaded;
		},
		get failed() {
			return failed;
		},
		get failedDetail() {
			return failedDetail;
		},
		get selectedId() {
			return selectedId;
		},
		get detail() {
			return detail;
		},
		get revisions() {
			return revisions;
		},
		get dirty() {
			return dirty;
		},
		get saving() {
			return saving;
		},
		get creating() {
			return creating;
		},
		select(id: string) {
			selectedId = id;
		},
		clearDetail,
		reload,
		loadDetail,
		submitNew,
		save,
		setStatus,
		toggleDelete,
	};
}

export type DocumentPage = ReturnType<typeof createDocumentPage>;
