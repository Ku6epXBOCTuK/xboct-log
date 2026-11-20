<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";
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
		type PlanWithCounts,
		removePlanItem,
		reorderPlanItems,
		restorePlanNote,
		type TextRevision,
		updatePlan,
	} from "#lib/api/plans.ts";
	import { getTasks } from "#lib/api/tasks.ts";
	import AppBar from "#lib/components/layout/AppBar.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import TaskSelect from "#lib/components/ui/select/TaskSelect.svelte";
	import { taskHref } from "#lib/navigation/href.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import type { Task } from "#lib/types.ts";
	import Plus from "~icons/lucide/plus";

	const { fresh } = useBoard();

	let plans = $state<PlanWithCounts[]>([]);
	let selectedId = $state<string | null>(null);
	let detail = $state<PlanWithCounts | null>(null);
	let items = $state<Task[]>([]);
	let candidates = $state<Task[]>([]);
	let itemFailed = $state(false);
	let loaded = $state(false);
	let failed = $state(false);
	let dragKey = $state<string | null>(null);
	let reorderFailed = $state(false);
	let newName = $state("");
	let creating = $state(false);
	let createFailed = $state(false);
	let planDocuments = $state<Document[]>([]);
	let allDocuments = $state<Document[]>([]);
	let selectedDocument = $state("");
	let documentFailed = $state(false);
	let notes = $state<PlanNote[]>([]);
	let deletedNotes = $state<PlanNote[]>([]);
	let noteDrafts = $state<Record<string, string>>({});
	let editingNote = $state<string | null>(null);
	let editingVersion = $state<string | null>(null);
	let editDraft = $state("");
	let notesFailed = $state(false);
	let revisionNoteId = $state<string | null>(null);
	let revisions = $state<TextRevision[]>([]);
	let revisionsFailed = $state(false);
	let editingKey = $state(false);
	let keyDraft = $state("");
	let keyFailed = $state(false);
	let openId = $state("");
	let openFailed = $state(false);

	async function submitNew(): Promise<void> {
		const name = newName.trim();
		if (name === "") return;
		creating = true;
		try {
			const plan = await createPlan({ name });
			newName = "";
			createFailed = false;
			selectedId = plan.id;
			await reloadPlans();
		} catch {
			createFailed = true;
		} finally {
			creating = false;
		}
	}

	async function openById(): Promise<void> {
		const value = openId.trim();
		if (value === "") return;
		try {
			const plan = await getPlan({ plan_id: value });
			openFailed = false;
			openId = "";
			selectedId = plan.id;
			await reloadPlans();
		} catch {
			openFailed = true;
		}
	}

	async function saveKey(): Promise<void> {
		if (detail === null) return;
		const id = detail.id;
		const key = keyDraft.trim();
		if (key === "") {
			keyFailed = true;
			return;
		}
		try {
			await updatePlan({ plan_id: id, patch: { key } });
			keyFailed = false;
			await reloadPlans();
			await loadDetail(id);
		} catch {
			keyFailed = true;
		}
	}

	async function reloadPlans(): Promise<void> {
		try {
			plans = await fetchFresh(getPlans({}));
			failed = false;
		} catch {
			failed = true;
		}
		loaded = true;
	}

	async function loadDetail(id: string): Promise<void> {
		try {
			const [plan, page, all, linked, docs, planNotes, deletedPlanNotes] =
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
			keyDraft = plan.key;
			editingKey = false;
			items = page.items;
			candidates = all.items;
			planDocuments = linked;
			allDocuments = docs;
			notes = planNotes;
			deletedNotes = deletedPlanNotes;
		} catch {
			failed = true;
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

	const tasksById = $derived(
		new Map<string, Task>(
			[...candidates, ...items].map((task) => [task.id, task] as const),
		),
	);

	function taskLink(id: string): string | null {
		const task = tasksById.get(id);
		return task === undefined ? null : taskHref(task.project_id, id);
	}

	const documentsToLink = $derived(
		allDocuments.filter(
			(document) => !planDocuments.some((linked) => linked.id === document.id),
		),
	);

	function notesFor(key: string): PlanNote[] {
		return notes.filter((note) => note.key === key);
	}

	function deletedNotesFor(key: string): PlanNote[] {
		return deletedNotes.filter((note) => note.key === key);
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

	async function restoreNote(noteId: string): Promise<void> {
		await changeNotes(() => restorePlanNote({ note_id: noteId }));
	}

	async function addNote(planId: string, taskId: string): Promise<void> {
		const body = (noteDrafts[taskId] ?? "").trim();
		if (body === "") return;
		noteDrafts[taskId] = "";
		await changeNotes(() =>
			addPlanNote({ plan_id: planId, task_id: taskId, body }),
		);
	}

	async function saveNote(): Promise<void> {
		if (editingNote === null) return;
		const body = editDraft.trim();
		if (body === "") return;
		const noteId = editingNote;
		const version = editingVersion;
		editingNote = null;
		editingVersion = null;
		await changeNotes(() =>
			editPlanNote({
				note_id: noteId,
				body,
				expected_edited_at: version,
			}),
		);
	}

	async function removeNote(noteId: string): Promise<void> {
		await changeNotes(() => deletePlanNote({ note_id: noteId }));
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

	$effect(() => {
		void reloadPlans();
	});

	$effect(() => {
		const offPlans = fresh.register("plans", () => void reloadPlans());
		const reloadDetail = () => {
			const id = selectedId ?? plans[0]?.id;
			if (id !== undefined) return loadDetail(id);
		};
		const offTasks = fresh.register("tasks", reloadDetail);
		const offDocuments = fresh.register("documents", reloadDetail);
		return () => {
			offPlans();
			offTasks();
			offDocuments();
		};
	});

	$effect(() => {
		const id = selectedId ?? plans[0]?.id ?? null;
		if (id === null) {
			detail = null;
			items = [];
			return;
		}
		void loadDetail(id);
	});
</script>

<section class="plans-page">
	<AppBar>
		{#snippet leading()}
			<h1>Plans</h1>
			<span class="muted">{plans.length} plans</span>
			<form
				class="create"
				onsubmit={(event) => {
					event.preventDefault();
					void submitNew();
				}}
			>
				<TextInput
					class="create-input"
					placeholder="New plan"
					aria-label="New plan name"
					maxlength={200}
					bind:value={newName}
				/>
				<Button
					variant="primary"
					type="submit"
					disabled={creating || newName.trim() === ""}
					title="Create a plan"
				>
					{#snippet icon()}
						<Plus />
					{/snippet}
					Create
				</Button>
			</form>
			{#if createFailed}
				<span class="create-error">Could not create the plan</span>
			{/if}
			<form
				class="open"
				onsubmit={(event) => {
					event.preventDefault();
					void openById();
				}}
			>
				<TextInput
					class="open-input"
					placeholder="PL-1"
					aria-label="Open plan by id"
					maxlength={40}
					bind:value={openId}
				/>
				<Button type="submit" disabled={openId.trim() === ""}>Open</Button>
			</form>
			{#if openFailed}
				<span class="create-error">No plan with that id</span>
			{/if}
		{/snippet}
	</AppBar>

	{#if failed}
		<div class="error-wrap">
			<ErrorNote message="Plans are unavailable" />
		</div>
	{/if}

	{#if !loaded}
		<p class="empty">Loading…</p>
	{:else if plans.length === 0}
		<p class="empty">No plans yet</p>
	{:else}
		<div class="columns">
			<ul class="plan-list">
				{#each plans as plan (plan.id)}
					<li>
						<button
							class="plan-link"
							class:active={plan.id === (selectedId ?? plans[0]?.id)}
							onclick={() => (selectedId = plan.id)}
						>
							<span class="plan-key">{plan.key}</span>
							<span class="plan-name">{plan.name}</span>
							<span class="plan-meta">
								{plan.status}
								· {plan.tasks_count} tasks · {plan.epics_count} epics
							</span>
						</button>
					</li>
				{/each}
			</ul>

			<div class="detail">
				{#if detail}
					{@const planId = detail.id}
					{@const planKey = detail.key}
					<header class="detail-head">
						<h2>{detail.name}</h2>
						<span class="status">{detail.status}</span>
						{#if editingKey}
							<form
								class="key-edit"
								onsubmit={(event) => {
									event.preventDefault();
									void saveKey();
								}}
							>
								<TextInput
									class="key-input"
									placeholder="PL-1"
									aria-label="Plan id"
									maxlength={20}
									bind:value={keyDraft}
								/>
								<Button
									variant="primary"
									type="submit"
									disabled={keyDraft.trim() === ""}
								>
									Save
								</Button>
								<Button
									onclick={() => {
										editingKey = false;
										keyDraft = planKey;
										keyFailed = false;
									}}
								>
									Cancel
								</Button>
							</form>
						{:else}
							<button
								class="plan-key-button"
								title="Edit plan id"
								onclick={() => (editingKey = true)}
							>
								{planKey}
							</button>
						{/if}
					</header>
					{#if keyFailed}
						<p class="item-error">Use a free PL-NUMBER id</p>
					{/if}
					{#if detail.description !== ""}
						<p class="description">{detail.description}</p>
					{/if}
					<h3>Items</h3>
					<div class="add-item">
						<TaskSelect
							items={candidates}
							value={items.map((item) => item.id)}
							onadd={(id) =>
								void changeItems(() =>
									addPlanItem({ plan_id: planId, task_id: id }),
								)}
							onremove={(id) =>
								void changeItems(() =>
									removePlanItem({ plan_id: planId, task_id: id }),
								)}
							href={taskLink}
							placeholder="Add a task to the plan"
							ariaLabel="Plan items"
						/>
					</div>
					{#if itemFailed}
						<p class="item-error">Could not change the plan items</p>
					{/if}
					{#if items.length === 0}
						<p class="empty">No items in this plan</p>
					{:else}
						{#if reorderFailed}
							<p class="reorder-error">Could not save the new order</p>
						{/if}
						<ol class="items">
							{#each items as item (item.id)}
								<li
									draggable="true"
									class:dragging={dragKey === item.id}
									ondragstart={(event) => {
										dragKey = item.id;
										event.dataTransfer?.setData("text/plain", item.id);
									}}
									ondragover={(event) => event.preventDefault()}
									ondrop={(event) => {
										event.preventDefault();
										void moveItem(item.id);
									}}
									ondragend={() => (dragKey = null)}
								>
									<a
										href={taskHref(item.project_id, item.id)}
										draggable="false"
									>
										{item.id}
									</a>
									<span class="item-title" class:epic={item.is_epic}>
										{item.title}
									</span>
									{#if item.deleted_at !== null}
										<span class="item-deleted">deleted</span>
									{/if}
									<div
										class="item-notes"
										draggable="false"
										role="presentation"
										ondragstart={(event) => event.stopPropagation()}
									>
										{#each notesFor(item.id) as note (note.id)}
											<div class="note">
												{#if editingNote === note.id}
													<textarea
														aria-label="Edit note"
														bind:value={editDraft}
													></textarea>
													<button type="button" onclick={() => void saveNote()}>
														Save
													</button>
													<button
														type="button"
														onclick={() => (editingNote = null)}
													>
														Cancel
													</button>
												{:else}
													<span class="note-body">{note.body}</span>
													<button
														type="button"
														onclick={() => {
															editingNote = note.id;
															editingVersion =
																note.edited_at ?? note.created_at;
															editDraft = note.body;
														}}
													>
														Edit
													</button>
													<button
														type="button"
														onclick={() => void removeNote(note.id)}
													>
														Delete
													</button>
													<button
														type="button"
														onclick={() => void showRevisions(note.id)}
													>
														History
													</button>
												{/if}
											</div>
											{#if revisionNoteId === note.id}
												<div class="note-history">
													{#if revisions.length === 0}
														<span class="note-empty">No earlier text</span>
													{:else}
														{#each revisions as revision (revision.id)}
															<div class="revision">
																<time>{revision.created_at}</time>
																<pre>{revision.body}</pre>
															</div>
														{/each}
													{/if}
												</div>
											{/if}
										{/each}
										{#each deletedNotesFor(item.id) as note (note.id)}
											<div class="note note-deleted">
												<span class="note-body">{note.body}</span>
												<span class="item-deleted">deleted</span>
												<button
													type="button"
													onclick={() => void restoreNote(note.id)}
												>
													Restore
												</button>
												<button
													type="button"
													onclick={() => void showRevisions(note.id)}
												>
													History
												</button>
											</div>
											{#if revisionNoteId === note.id}
												<div class="note-history">
													{#if revisions.length === 0}
														<span class="note-empty">No earlier text</span>
													{:else}
														{#each revisions as revision (revision.id)}
															<div class="revision">
																<time>{revision.created_at}</time>
																<pre>{revision.body}</pre>
															</div>
														{/each}
													{/if}
												</div>
											{/if}
										{/each}
										<div class="note-add">
											<textarea
												aria-label={`Note for ${item.id}`}
												placeholder="Add a note"
												bind:value={noteDrafts[item.id]}
											></textarea>
											<button
												type="button"
												onclick={() => void addNote(planId, item.id)}
											>
												Add note
											</button>
										</div>
									</div>
								</li>
							{/each}
						</ol>
					{/if}
					{#if notesFailed}
						<p class="error-text">Could not save the note</p>
					{/if}
					{#if revisionsFailed}
						<p class="error-text">Could not load note history</p>
					{/if}
					<h3>Documents</h3>
					{#if documentFailed}
						<p class="error-text">Could not change the plan documents</p>
					{/if}
					{#if documentsToLink.length > 0}
						<div class="link-document">
							<select
								aria-label="Document to link"
								bind:value={selectedDocument}
							>
								<option value="">Select a document</option>
								{#each documentsToLink as document (document.id)}
									<option value={document.id}>
										{document.key ?? document.id}
										— {document.title}
									</option>
								{/each}
							</select>
							<button
								type="button"
								disabled={selectedDocument === ""}
								onclick={() => {
									const documentId = selectedDocument;
									selectedDocument = "";
									void changeDocuments(() =>
										linkDocumentToPlan({
											plan_id: planId,
											document_id: documentId,
										}),
									);
								}}
							>
								Link
							</button>
						</div>
					{/if}
					{#if planDocuments.length === 0}
						<p class="empty">No documents linked to this plan</p>
					{:else}
						<ul class="plan-documents">
							{#each planDocuments as document (document.id)}
								<li>
									<span class="document-key">
										{document.key ?? document.id}
									</span>
									<span>{document.title}</span>
									<span class="document-kind">{document.kind}</span>
									<button
										type="button"
										onclick={() =>
											void changeDocuments(() =>
												unlinkDocumentFromPlan({
													plan_id: planId,
													document_id: document.id,
												}),
											)}
									>
										Unlink
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.plans-page {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--background);
	}

	.create {
		display: flex;
		gap: var(--space-2);
		margin-left: auto;
	}

	.create :global(.create-input) {
		width: 14rem;
	}

	.create-error {
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.open {
		display: flex;
		gap: var(--space-2);
	}

	.open :global(.open-input) {
		width: 9rem;
	}

	.error-wrap {
		margin: 0 var(--edge-pad) var(--space-3);
	}

	.empty {
		margin: 0;
		padding: var(--space-8) var(--edge-pad);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.columns {
		flex: 1 1 auto;
		min-height: 0;
		display: grid;
		grid-template-columns: 20rem minmax(0, 1fr);
	}

	.plan-list {
		min-height: 0;
		overflow: auto;
		margin: 0;
		padding: 0 var(--space-2) var(--space-6) var(--edge-pad);
		list-style: none;
		border-right: 1px solid var(--border);
	}

	.plan-link {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text-secondary);
		text-align: left;
		cursor: pointer;
	}

	.plan-link:hover {
		background: var(--hover);
	}

	.plan-link.active {
		background: var(--selected);
		color: var(--foreground);
	}

	.plan-key {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.plan-name {
		font-size: var(--text-md);
		font-weight: 500;
	}

	.plan-meta {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.detail {
		min-height: 0;
		overflow: auto;
		padding: 0 var(--edge-pad) var(--space-6);
	}

	.detail-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}

	.detail-head h2 {
		margin: 0;
		font-size: var(--text-xl);
	}

	.plan-key-button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		cursor: pointer;
	}

	.plan-key-button:hover {
		color: var(--foreground);
	}

	.key-edit {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.key-edit :global(.key-input) {
		width: 8rem;
	}

	.status {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.description {
		margin: var(--space-3) 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.detail h3 {
		margin: var(--space-5) 0 var(--space-2);
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.add-item {
		margin-bottom: var(--space-3);
	}

	.item-error {
		margin: 0 0 var(--space-2);
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.items {
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: item;
	}

	.reorder-error {
		margin: var(--space-2) 0;
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.items li {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		cursor: grab;
	}

	.items li.dragging {
		opacity: 0.5;
	}

	.items li::before {
		counter-increment: item;
		content: counter(item) ".";
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.items a {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.item-title {
		font-size: var(--text-sm);
	}

	.item-title.epic {
		font-weight: 600;
	}

	.item-deleted {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.items li {
		align-items: flex-start;
	}

	.item-notes {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		margin-left: auto;
	}

	.note,
	.note-add {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-2);
	}

	.note-body {
		max-width: 24rem;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: pre-wrap;
	}

	.note-deleted {
		opacity: 0.7;
	}

	.note-history {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-width: 28rem;
	}

	.note-empty {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.revision time {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.revision pre {
		margin: 0;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius);
		background: var(--surface);
		font-size: var(--text-xs);
		white-space: pre-wrap;
	}

	.item-notes textarea,
	.link-document select {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--foreground);
		font: inherit;
		font-size: var(--text-sm);
		padding: var(--space-1) var(--space-2);
	}

	.item-notes textarea {
		min-height: 3rem;
		width: 16rem;
		resize: vertical;
	}

	.item-notes button,
	.link-document button,
	.plan-documents button {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text-secondary);
		cursor: pointer;
		font-size: var(--text-xs);
		padding: var(--space-1) var(--space-2);
	}

	.item-notes button:hover,
	.link-document button:hover,
	.plan-documents button:hover {
		color: var(--foreground);
		background: var(--hover);
	}

	.error-text {
		margin: var(--space-2) 0;
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.link-document {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.plan-documents {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.plan-documents li {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}

	.document-key {
		font-family: var(--font-mono);
	}

	.document-kind {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.plan-documents button {
		margin-left: auto;
	}

	@media (max-width: 48rem) {
		.create {
			margin-left: 0;
			flex: 1 1 100%;
		}

		.create :global(.create-input) {
			flex: 1 1 auto;
			width: auto;
		}

		.columns {
			grid-template-columns: minmax(0, 1fr);
			overflow: auto;
		}

		.plan-list {
			max-height: 16rem;
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}
	}
</style>
