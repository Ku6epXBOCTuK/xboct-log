<script lang="ts">
	import AttachmentItem from "#lib/components/attachments/AttachmentItem.svelte";
	import AttachmentList from "#lib/components/attachments/AttachmentList.svelte";
	import ProjectScopeFields from "#lib/components/task/ProjectScopeFields.svelte";
	import TaskFields from "#lib/components/task/TaskFields.svelte";
	import TaskLinks from "#lib/components/task/TaskLinks.svelte";
	import AdvancedFields from "#lib/components/task/AdvancedFields.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import DropOverlay from "#lib/components/ui/DropOverlay.svelte";
	import SectionDivider from "#lib/components/ui/SectionDivider.svelte";
	import type { DraftStore } from "#lib/state/draft.svelte.ts";
	import type { ProjectDataStore } from "#lib/state/project-data.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TagStore } from "#lib/state/tags.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import type { UiStore } from "#lib/state/ui.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import { fileToBase64, isImage } from "#lib/tasks/attachments.ts";
	import { addTaskAttachment } from "#lib/remote/attachments.remote.ts";
	import { matchesHotkey } from "#lib/hotkeys/hotkeys.ts";
	import { fieldNavigation } from "#lib/hotkeys/fields.ts";
	import { fileDrop } from "#lib/files/drop.ts";
	import {
		advancedFilledCount,
		draftHasContent,
		fitDraftToProjects,
	} from "#lib/tasks/fields.ts";
	import {
		epicsForProject,
		validateTaskDraft,
		type TaskFieldValues,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import {
		emptyLinkDraft,
		hasLinks,
		type LinkField,
		type TaskLinkDraft,
	} from "#lib/tasks/links.ts";
	import { createTaskFinder } from "#lib/state/task-finder.svelte.ts";
	import {
		CLOSED_STATUSES,
		INBOX_PROJECT_ID,
		type Project,
		type Task,
	} from "#lib/types.ts";
	import { untrack } from "svelte";
	import ArrowLeft from "~icons/lucide/arrow-left";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import Button from "@ku6epxboctuk/ui-kit/components/Button";
	import ControlRow from "@ku6epxboctuk/ui-kit/components/ControlRow";
	import ScrollArea from "@ku6epxboctuk/ui-kit/components/ScrollArea";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput";
	import Paperclip from "~icons/lucide/paperclip";
	import Upload from "~icons/lucide/upload";

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
	let tagEntries = $derived(tags.ordered(projectData?.tags ?? []));
	let tagSuggestions = $derived(tagEntries.map((entry) => entry.tag));
	let tagCounts = $derived(
		Object.fromEntries(tagEntries.map((entry) => [entry.tag, entry.count])),
	);
	let title = $state("");
	let keepOpen = $state(false);
	let saving = $state(false);
	let failure = $state<string | null>(null);
	let invalidField = $state(false);
	let formElement = $state<HTMLFormElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let files = $state<File[]>([]);
	let dragging = $state(false);
	let committed = $state(false);

	untrack(() => {
		const restored = draftStore.saved;
		if (!restored) return;
		draft = fitDraftToProjects(
			{ ...restored.values, tags: [...restored.values.tags] },
			projects,
			epics,
			scopes.all,
			defaultProject(),
		);
		title = restored.title;
		files = restored.files ? [...restored.files] : [];
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
		draftStore.save({ values, title, files: [...files], links: snapshot });
	});

	function reset() {
		draft = {
			...blankDraft(),
			project_id: draft.project_id,
			scope_id: draft.scope_id,
		};
		links = emptyLinkDraft();
		title = "";
		files = [];
		failure = null;
		invalidField = false;
		committed = false;
	}

	function pickFiles(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const picked = [...(target.files ?? [])];
		target.value = "";
		if (picked.length === 0) return;
		files = [...files, ...picked];
	}

	function paste(event: ClipboardEvent) {
		const images = [...(event.clipboardData?.files ?? [])].filter((file) =>
			isImage(file.type),
		);
		if (images.length === 0) return;
		event.preventDefault();
		files = [...files, ...images];
	}

	async function uploadFiles(taskId: string) {
		for (const file of files) {
			const content = await fileToBase64(file);
			await addTaskAttachment({
				task_id: taskId,
				filename: file.name,
				content_base64: content,
				mime_type: file.type || undefined,
			});
		}
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

	async function applyLinks(taskId: string): Promise<string | null> {
		try {
			for (const target of links.blocked_by) {
				await tasks.addBlocker(taskId, target);
			}
			for (const target of links.blocks) {
				await tasks.addBlocker(target, taskId);
			}
			for (const target of links.relates_to) {
				await tasks.addLink(taskId, "relates_to", target);
			}
			for (const target of links.duplicates) {
				await tasks.addLink(taskId, "duplicates", target);
			}
			for (const target of links.duplicated_by) {
				await tasks.addLink(target, "duplicates", taskId);
			}
			return null;
		} catch (error) {
			return messageOf(error);
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();

		if (invalidField) return;

		failure = null;

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
			const created = await tasks.create({
				project_id: draft.project_id,
				title: title.trim(),
				description: draft.description,
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

			draftStore.setLast({ id: created.id, title: created.title });
			draftStore.clearDraft();

			if (files.length > 0) {
				try {
					await uploadFiles(created.id);
				} catch (error) {
					failure = messageOf(error);
				}
				files = [];
			}

			if (hasLinks(links)) {
				const linkFailure = await applyLinks(created.id);
				if (linkFailure !== null) failure = linkFailure;
			}

			if (keepOpen) {
				reset();
			} else {
				onclose();
			}
		} catch (error) {
			failure = messageOf(error);
			committed = false;
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
		onfiles: (dropped) => (files = [...files, ...dropped]),
		ondragchange: (value) => (dragging = value),
	}}
>
	<ScrollArea class="panel-body">
		<ProjectScopeFields
			value={draft}
			{projects}
			scopes={scopeOptions}
			{onfield}
			{onproject}
			{onnewscope}
		/>

		<div class="field detail-field title-field">
			<label for="new-task-title">Title</label>
			<ControlRow>
				<div class="title-control">
					<TextInput
						id="new-task-title"
						bind:value={title}
						placeholder="What needs to be done"
					/>
				</div>
				<IconButton
					label="Attach a file"
					title="Attach a file"
					size="md"
					onclick={() => fileInput?.click()}
				>
					<Paperclip />
				</IconButton>
			</ControlRow>
		</div>

		<TaskFields
			value={draft}
			epics={epicOptions}
			{tagSuggestions}
			{tagCounts}
			{onfield}
			{onunknowntag}
		/>

		<TaskLinks
			blockedBy={links.blocked_by}
			blocks={links.blocks}
			relatesTo={links.relates_to}
			duplicates={links.duplicates}
			duplicatedBy={links.duplicated_by}
			candidates={linkCandidates}
			blockerCandidates={linkCandidates}
			onadd={addLink}
			onremove={removeLink}
			onsearch={finder.search}
		/>

		<SectionDivider
			title="Advanced"
			count={advancedFilledCount(draft)}
			open={ui.advanced}
			onopenchange={(value) => ui.set(value)}
		>
			<AdvancedFields
				value={draft}
				{onfield}
				onerror={(message) => {
					failure = message;
					invalidField = true;
				}}
			/>
		</SectionDivider>

		<div class="attachments">
			<SectionDivider title="Attachments">
				<IconButton
					label="Attach a file"
					title="Attach a file"
					onclick={() => fileInput?.click()}
				>
					<Upload />
				</IconButton>
				<input
					bind:this={fileInput}
					type="file"
					multiple
					hidden
					onchange={pickFiles}
				/>
			</SectionDivider>
			{#if files.length > 0}
				<AttachmentList>
					{#each files as file, index (file.name + index)}
						<AttachmentItem
							name={file.name}
							size={file.size}
							{file}
							busy={saving}
							onremove={() => (files = files.filter((_, i) => i !== index))}
						/>
					{/each}
				</AttachmentList>
			{/if}
		</div>
	</ScrollArea>

	<div class="modal-foot">
		<ErrorNote message={failure} />

		<div class="modal-actions">
			<label class="modal-check">
				<input type="checkbox" bind:checked={keepOpen} />
				Create another
				<kbd>Ctrl+Alt+C</kbd>
			</label>
			{#if draftStore.last}
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
			<Button type="button" onclick={cancel}>Cancel</Button>
			<Button variant="primary" type="submit" disabled={saving}>
				{saving ? "creating…" : "Create task"}
			</Button>
		</div>
	</div>

	{#if dragging}
		<DropOverlay />
	{/if}
</form>

<style>
	.attachments {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
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

	.title-control {
		flex: 1 1 auto;
		min-width: 0;
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
