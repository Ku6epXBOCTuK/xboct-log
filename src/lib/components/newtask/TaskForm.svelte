<script lang="ts">
	import AttachButton from "#lib/components/attachments/AttachButton.svelte";
	import AttachmentBody from "#lib/components/attachments/AttachmentBody.svelte";
	import AttachmentSection from "#lib/components/attachments/AttachmentSection.svelte";
	import TaskEditorFields from "#lib/components/task/TaskEditorFields.svelte";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import DropOverlay from "#lib/components/ui/DropOverlay.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import { fileDrop } from "#lib/files/drop.ts";
	import { fieldNavigation } from "#lib/hotkeys/fields.ts";
	import { matchesHotkey } from "#lib/hotkeys/hotkeys.ts";
	import { taskHrefFor } from "#lib/navigation/href.ts";
	import { createDraftAttachments } from "#lib/state/attachments.svelte.ts";
	import type { DraftStore } from "#lib/state/draft.svelte.ts";
	import type { ProjectDataStore } from "#lib/state/project-data.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TagStore } from "#lib/state/tags.svelte.ts";
	import { createTaskFinder } from "#lib/state/task-finder.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import type { UiStore } from "#lib/state/ui.svelte.ts";
	import { ATTACHMENT_ACCEPT } from "#lib/tasks/attachment-kinds.ts";
	import type { UploadFailure } from "#lib/tasks/attachments.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import {
		draftHasContent,
		epicsForProject,
		fitDraftToProjects,
		validateTaskDraft,
		type TaskFieldValues,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import {
		applyLinkJobs,
		emptyLinkDraft,
		hasLinks,
		type LinkFailure,
		type LinkField,
		type LinkJob,
		type TaskLinkDraft,
	} from "#lib/tasks/links.ts";
	import {
		CLOSED_STATUSES,
		INBOX_PROJECT_ID,
		type Project,
		type Task,
	} from "#lib/types.ts";
	import Button from "@ku6epxboctuk/ui-kit/components/Button";
	import ScrollArea from "@ku6epxboctuk/ui-kit/components/ScrollArea";
	import { untrack } from "svelte";
	import ArrowLeft from "~icons/lucide/arrow-left";
	import Paperclip from "~icons/lucide/paperclip";

	interface Props {
		tasks: TaskStore;
		epics: Task[];
		projects: Project[];
		scopes: ScopeStore;
		tags: TagStore;
		data: ProjectDataStore;
		draftStore: DraftStore;
		ui: UiStore;
		initialProject?: string;
		initialEpic?: string | null;
		initialScope?: number | null;
		onclose: () => void;
		onopen?: (id: string) => void;
	}

	let {
		tasks,
		epics,
		projects,
		scopes,
		tags,
		data,
		draftStore,
		ui,
		initialProject,
		initialEpic = null,
		initialScope = null,
		onclose,
		onopen,
	}: Props = $props();

	function defaultProject(): string {
		if (
			initialProject !== undefined &&
			projects.some((project) => project.id === initialProject)
		) {
			return initialProject;
		}
		if (projects.some((project) => project.id === INBOX_PROJECT_ID)) {
			return INBOX_PROJECT_ID;
		}
		return projects[0]?.id ?? "";
	}

	function blankDraft(): TaskFieldValues {
		return {
			project_id: defaultProject(),
			status: "backlog",
			priority: "medium",
			is_epic: false,
			epic_id: initialEpic,
			scope_id: initialScope,
			source_file: null,
			tags: [],
			estimate: null,
			assignee: null,
			due_at: null,
			description: "",
		};
	}

	let draft = $state<TaskFieldValues>(blankDraft());
	let links = $state<TaskLinkDraft>(emptyLinkDraft());
	const finder = createTaskFinder();
	let projectData = $derived(data.of(draft.project_id));
	const projectRepo = $derived(
		projects.find((project) => project.id === draft.project_id)?.repo ?? null,
	);
	let tagPicker = $derived(tags.picker(projectData?.tags ?? []));
	let title = $state("");
	let keepOpen = $state(false);
	let saving = $state(false);
	let failure = $state<string | null>(null);
	let invalidField = $state(false);
	let formElement = $state<HTMLFormElement | null>(null);
	let dragging = $state(false);
	let committed = $state(false);
	let created = $state<{ id: string; title: string } | null>(null);
	const attachmentsStore = createDraftAttachments();

	untrack(() => {
		const restored = draftStore.saved;
		if (!restored) return;
		draft = fitDraftToProjects(
			{ ...blankDraft(), ...restored.values, tags: [...restored.values.tags] },
			projects,
			epics,
			scopes.all,
			defaultProject(),
		);
		title = restored.title;
		attachmentsStore.restore(restored.files ?? []);
		links = { ...emptyLinkDraft(), ...restored.links };
	});

	const epicOptions = $derived(
		epicsForProject(epics, draft.project_id, draft.epic_id),
	);
	const scopeOptions = $derived(scopes.listFor(draft.project_id));

	function openTasks(base: Task[]): Task[] {
		return base.filter((task) => !CLOSED_STATUSES.includes(task.status));
	}

	function append(base: Task[], extra: Task[]): Task[] {
		const ids = new Set(base.map((task) => task.id));
		return [...base, ...extra.filter((task) => !ids.has(task.id))];
	}

	let linkCandidates = $derived(
		append(openTasks(projectData?.tasks ?? []), openTasks(finder.found)),
	);

	const pendingLinks = $derived(
		(Object.entries(links) as [LinkField, string[]][]).flatMap(
			([field, targets]) =>
				targets.map((target) => `${field.replaceAll("_", " ")} ${target}`),
		),
	);

	const retryLabel = $derived(
		attachmentsStore.count > 0
			? "Retry upload"
			: pendingLinks.length > 0
				? "Retry links"
				: "Done",
	);

	function linkHref(id: string): string | null {
		return taskHrefFor(
			(value) =>
				linkCandidates.find((item) => item.id === value) ?? tasks.byId(value),
			id,
		);
	}

	function addLink(field: LinkField, id: string) {
		links = { ...links, [field]: [...links[field], id] };
	}

	function removeLink(field: LinkField, id: string) {
		links = { ...links, [field]: links[field].filter((item) => item !== id) };
	}

	$effect(() => {
		data.ensure(draft.project_id);
	});

	$effect(() => {
		formElement?.querySelector<HTMLInputElement>("#new-task-title")?.focus();
	});

	$effect(() => {
		const values = { ...draft, tags: [...draft.tags] };
		const snapshot = { ...links };
		if (committed || (!draftHasContent(values, title) && !hasLinks(snapshot)))
			return;
		draftStore.save({
			values,
			title,
			files: attachmentsStore.files,
			links: snapshot,
		});
	});

	function reset() {
		draft = {
			...blankDraft(),
			project_id: draft.project_id,
			scope_id: draft.scope_id,
		};
		links = emptyLinkDraft();
		title = "";
		attachmentsStore.clear();
		failure = null;
		invalidField = false;
		committed = false;
		created = null;
	}

	function pickFiles(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const picked = [...(target.files ?? [])];
		target.value = "";
		attachmentsStore.addFiles(picked);
	}

	function paste(event: ClipboardEvent) {
		const files = [...(event.clipboardData?.files ?? [])];
		if (files.length === 0) return;
		event.preventDefault();
		attachmentsStore.addFiles(files);
	}

	function onfield(patch: TaskPatch) {
		Object.assign(draft, patch);
		failure = null;
		invalidField = false;
	}

	function cancel() {
		committed = true;
		draftStore.clearDraft();
		onclose();
	}

	function backToLast() {
		const last = draftStore.last;
		if (!last) return;
		onopen?.(last.id);
	}

	function onproject(projectId: string) {
		Object.assign(draft, {
			project_id: projectId,
			epic_id: null,
			scope_id: null,
		});
		failure = null;
		invalidField = false;
	}

	async function onnewscope(name: string): Promise<number> {
		const scope = await scopes.create({
			project_id: draft.project_id,
			name,
		});
		return scope.id;
	}

	async function onunknowntag(name: string) {
		await tags.create(name);
	}

	function onkeydown(event: KeyboardEvent) {
		if (matchesHotkey(event, "ctrl+alt+c")) {
			event.preventDefault();
			keepOpen = !keepOpen;
			return;
		}

		if (event.key !== "Enter") return;
		if (!event.ctrlKey && !event.metaKey) return;

		event.preventDefault();

		if (saving) return;

		// NOTE: fields commit on change (blur), so the focused control must be
		// blurred before submit or its edit is missing from the draft.
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}

		formElement?.requestSubmit();
	}

	function linkJobs(taskId: string): LinkJob[] {
		const jobs: LinkJob[] = [];
		for (const target of links.blocked_by) {
			jobs.push({
				field: "blocked_by",
				target,
				run: () => tasks.addBlocker(taskId, target),
			});
		}
		for (const target of links.blocks) {
			jobs.push({
				field: "blocks",
				target,
				run: () => tasks.addBlocker(target, taskId),
			});
		}
		for (const target of links.relates_to) {
			jobs.push({
				field: "relates_to",
				target,
				run: () => tasks.addLink(taskId, "relates_to", target),
			});
		}
		for (const target of links.duplicates) {
			jobs.push({
				field: "duplicates",
				target,
				run: () => tasks.addLink(taskId, "duplicates", target),
			});
		}
		for (const target of links.duplicated_by) {
			jobs.push({
				field: "duplicated_by",
				target,
				run: () => tasks.addLink(target, "duplicates", taskId),
			});
		}
		return jobs;
	}

	function linkFailureMessage(items: LinkFailure[]): string {
		const names = items.map(
			(item) =>
				`${item.field.replaceAll("_", " ")} ${item.target}: ${item.message}`,
		);
		return `${items.length} ${items.length === 1 ? "link was" : "links were"} not saved: ${names.join("; ")}`;
	}

	async function applyLinks(taskId: string) {
		const failures = await applyLinkJobs(linkJobs(taskId), (job) =>
			removeLink(job.field, job.target),
		);
		if (failures.length > 0) failure = linkFailureMessage(failures);
		return failures.length === 0;
	}

	function uploadFailure(items: UploadFailure[]): string {
		const names = items.map((item) => `${item.name}: ${item.message}`);
		return `${items.length} ${items.length === 1 ? "file was" : "files were"} not attached: ${names.join("; ")}`;
	}

	async function sendAttachments(taskId: string): Promise<boolean> {
		if (attachmentsStore.count === 0) return true;
		const outcome = await attachmentsStore.upload(taskId);
		if (outcome.attached.length > 0) {
			tasks.bumpAttachments(taskId, outcome.attached.length);
		}
		if (outcome.failed.length === 0) return true;
		failure = uploadFailure(outcome.failed);
		return false;
	}

	async function finishCreated(taskId: string) {
		if (!(await applyLinks(taskId))) return;

		if (keepOpen) {
			reset();
		} else {
			onclose();
		}
	}

	async function retryUpload() {
		if (created === null) return;
		saving = true;
		try {
			if (!(await sendAttachments(created.id))) return;
			await finishCreated(created.id);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}

	function openCreated() {
		if (created === null) return;
		if (onopen === undefined) {
			onclose();
			return;
		}
		onopen(created.id);
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();

		if (invalidField || saving) return;

		failure = null;

		if (created !== null) {
			await retryUpload();
			return;
		}

		if (draft.project_id === "") {
			failure = "create a project first";
			return;
		}

		const invalid = validateTaskDraft({
			title,
			source_file: draft.source_file ?? "",
		});

		if (invalid !== null) {
			failure = invalid;
			return;
		}

		committed = true;
		saving = true;

		try {
			const task = await tasks.create({
				project_id: draft.project_id,
				title: title.trim(),
				description: draft.description,
				status: draft.status,
				priority: draft.priority,
				is_epic: draft.is_epic,
				epic_id: draft.is_epic ? null : draft.epic_id,
				scope_id: draft.scope_id,
				source_file: draft.source_file,
				tags: draft.tags,
				estimate: draft.estimate,
				assignee: draft.assignee,
				due_at: draft.due_at,
			});

			draftStore.setLast({ id: task.id, title: task.title });
			draftStore.clearDraft();
			created = { id: task.id, title: task.title };

			if (!(await sendAttachments(task.id))) return;

			await finishCreated(task.id);
		} catch (error) {
			failure = messageOf(error);
			if (created === null) committed = false;
		} finally {
			saving = false;
		}
	}
</script>

<svelte:window {onkeydown} onpaste={paste} />

<form
	bind:this={formElement}
	onsubmit={submit}
	use:fieldNavigation
	use:fileDrop={{
		onfiles: (dropped) => attachmentsStore.addFiles(dropped),
		ondragchange: (value) => (dragging = value),
	}}
>
	{#snippet titleTrailing()}
		<CopyButton text={title} label="copy title" />
		<AttachButton
			count={attachmentsStore.count}
			fresh={attachmentsStore.fresh}
			denied={attachmentsStore.denied}
			onpick={attachmentsStore.openPicker}
		/>
	{/snippet}

	{#snippet attachments()}
		{#snippet hidden()}
			<input
				bind:this={attachmentsStore.input}
				type="file"
				multiple
				accept={ATTACHMENT_ACCEPT}
				hidden
				onchange={pickFiles}
			/>
		{/snippet}
		<AttachmentSection
			count={attachmentsStore.count}
			fresh={attachmentsStore.fresh}
			denied={attachmentsStore.denied}
			notice={attachmentsStore.notice}
			onpick={attachmentsStore.openPicker}
			{hidden}
		>
			<AttachmentBody
				items={attachmentsStore.entries}
				busy={saving}
				onremove={attachmentsStore.remove}
			/>
		</AttachmentSection>
	{/snippet}

	<ScrollArea class="panel-body">
		{#if created !== null}
			<div class="created">
				<p class="created-id">{created.id} created</p>
				<p class="created-task">{created.title}</p>
				{#if attachmentsStore.count > 0}
					<p class="created-hint">
						These files did not reach the task. Retry, or add them to the task
						later.
					</p>
					<AttachmentBody
						items={attachmentsStore.entries}
						busy={saving}
						onremove={attachmentsStore.remove}
					/>
				{/if}
				{#if pendingLinks.length > 0}
					<p class="created-hint">
						These links did not reach the task. Retry, or add them on the task
						page.
					</p>
					<ul class="created-links">
						{#each pendingLinks as line (line)}
							<li>{line}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else}
			<TaskEditorFields
				bind:title
				value={draft}
				titleId="new-task-title"
				{titleTrailing}
				epics={epicOptions}
				{projects}
				scopes={scopeOptions}
				repo={projectRepo}
				{tagPicker}
				linkFields={links}
				{linkCandidates}
				blockerCandidates={linkCandidates}
				onlinkadd={addLink}
				onlinkremove={removeLink}
				{linkHref}
				onlinkopen={onclose}
				onlinksearch={finder.search}
				{onfield}
				{onproject}
				{onnewscope}
				{onunknowntag}
				onerror={(message) => {
					failure = message;
					invalidField = true;
				}}
				status={draft.status}
				onstatus={(status) => onfield({ status })}
				statusWarn={draft.status !== "backlog"}
				advancedOpen={ui.advanced}
				onadvancedchange={(value) => ui.set(value)}
				{attachments}
			/>
		{/if}
	</ScrollArea>

	<div class="modal-foot">
		<ErrorNote message={failure} />

		<div class="modal-actions">
			{#if created === null}
				<label class="modal-check">
					<input type="checkbox" bind:checked={keepOpen} />
					Create another
					<kbd>Ctrl+Alt+C</kbd>
				</label>
			{:else}
				<span class="created-spacer"></span>
			{/if}
			{#if attachmentsStore.count > 0}
				<span class="attach-chip" class:is-fresh={attachmentsStore.fresh}>
					<Paperclip />
					{attachmentsStore.count}
					{attachmentsStore.count === 1 ? "file" : "files"}
				</span>
			{/if}
			{#if created === null && draftStore.last}
				<button
					class="back-button"
					type="button"
					onclick={backToLast}
					title={draftStore.last.title}
				>
					<ArrowLeft />
					{draftStore.last.id}
				</button>
			{/if}
			{#if created === null}
				<Button type="button" onclick={cancel}>Cancel</Button>
				<Button variant="primary" type="submit" disabled={saving}>
					{saving ? "creating…" : "Create task"}
				</Button>
			{:else}
				{#if onopen !== undefined}
					<Button type="button" onclick={openCreated}>Open task</Button>
				{/if}
				<Button type="button" onclick={cancel}>Close</Button>
				<Button variant="primary" type="submit" disabled={saving}>
					{saving ? "saving…" : retryLabel}
				</Button>
			{/if}
		</div>
	</div>

	{#if dragging}
		<DropOverlay />
	{/if}
</form>

<style>
	.attach-chip {
		display: flex;
		align-items: center;
		flex: none;
		gap: var(--space-1);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: nowrap;
		transition: color 150ms ease;
	}

	.attach-chip :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
	}

	.attach-chip.is-fresh {
		color: var(--accent-ink);
	}

	form {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
		position: relative;
	}

	.modal-foot {
		flex: none;
		margin: 0 calc(var(--modal-pad) * -1) calc(var(--modal-pad) * -1);
		padding: var(--space-3) var(--modal-pad) var(--modal-pad);
	}

	.modal-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}

	.modal-check {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--space-2);
		margin-right: auto;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-weight: 400;
	}

	.modal-check input {
		width: auto;
		min-height: 0;
		margin: 0;
		accent-color: var(--accent);
	}

	.modal-check kbd {
		border: 1px solid var(--border);
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
		font-size: var(--text-xs);
		line-height: 1.35rem;
	}

	.created {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-top: var(--space-2);
	}

	.created-spacer {
		flex: 1 1 auto;
	}

	.created-id {
		margin: 0;
		color: var(--accent-ink);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.created-task {
		margin: 0;
		color: var(--foreground);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.25;
	}

	.created-hint {
		margin: var(--space-2) 0 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.created-links {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.back-button {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--panel);
		color: var(--text-secondary);
		padding: 0 var(--space-2);
		height: var(--control-h-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.back-button:hover {
		color: var(--foreground);
		background: var(--hover);
	}

	.back-button :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
		flex: none;
	}
</style>
