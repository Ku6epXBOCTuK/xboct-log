<script lang="ts">
	import AttachmentItem from "#lib/components/attachments/AttachmentItem.svelte";
	import AttachmentList from "#lib/components/attachments/AttachmentList.svelte";
	import ProjectScopeFields from "#lib/components/task/ProjectScopeFields.svelte";
	import TaskFields from "#lib/components/task/TaskFields.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type { DraftStore } from "#lib/state/draft.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TagStore } from "#lib/state/tags.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import type { UiStore } from "#lib/state/ui.svelte.ts";
	import AdvancedToggle from "#lib/components/task/AdvancedToggle.svelte";
	import { messageOf } from "#lib/tasks/display.ts";
	import { fileToBase64 } from "#lib/tasks/attachments.ts";
	import { addTaskAttachment } from "#lib/remote/attachments.remote.ts";
	import { collectTags } from "#lib/tasks/filter.ts";
	import { matchesHotkey } from "#lib/hotkeys/hotkeys.ts";
	import { fieldNavigation } from "#lib/hotkeys/fields.ts";
	import { advancedFilledCount } from "#lib/tasks/fields.ts";
	import {
		epicsForProject,
		validateTaskDraft,
		type TaskFieldValues,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import { INBOX_PROJECT_ID, type Project } from "#lib/types.ts";
	import { untrack } from "svelte";
	import ArrowLeft from "~icons/lucide/arrow-left";
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import Paperclip from "~icons/lucide/paperclip";
	import Upload from "~icons/lucide/upload";

	interface Props {
		tasks: TaskStore;
		projects: Project[];
		scopes: ScopeStore;
		tags: TagStore;
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
		projects,
		scopes,
		tags,
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
	let tagEntries = $derived(
		tags.ranked(collectTags(tasks.tasks, draft.project_id)),
	);
	let tagSuggestions = $derived(tagEntries.map((entry) => entry.tag));
	let tagCounts = $derived(
		Object.fromEntries(tagEntries.map((entry) => [entry.tag, entry.count])),
	);
	let title = $state("");
	let keepOpen = $state(false);
	let saving = $state(false);
	let failure = $state<string | null>(null);
	let invalidField = $state(false);
	let titleInput = $state<HTMLInputElement | null>(null);
	let formElement = $state<HTMLFormElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let files = $state<File[]>([]);
	let dragging = $state(false);

	const restored = untrack(() => draftStore.saved);
	if (restored) {
		draft = restored.values;
		title = restored.title;
	}

	const epicOptions = $derived(
		epicsForProject(tasks.epics, draft.project_id, draft.epic_id),
	);
	const scopeOptions = $derived(scopes.listFor(draft.project_id));

	$effect(() => {
		titleInput?.focus();
	});

	function reset() {
		draft = {
			...blankDraft(),
			project_id: draft.project_id,
			scope_id: draft.scope_id,
		};
		title = "";
		files = [];
		failure = null;
		invalidField = false;
	}

	function pickFiles(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const picked = [...(target.files ?? [])];
		target.value = "";
		if (picked.length === 0) return;
		files = [...files, ...picked];
	}

	function paste(event: ClipboardEvent) {
		const pasted = [...(event.clipboardData?.files ?? [])];
		if (pasted.length === 0) return;
		event.preventDefault();
		files = [...files, ...pasted];
	}

	function dragOver(event: DragEvent) {
		if (event.dataTransfer?.types.includes("Files") !== true) return;
		event.preventDefault();
		dragging = true;
	}

	function dragLeave(event: DragEvent) {
		const form = event.currentTarget;
		const related = event.relatedTarget;
		if (
			form instanceof Node &&
			related instanceof Node &&
			form.contains(related)
		) {
			return;
		}
		dragging = false;
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		const dropped = [...(event.dataTransfer?.files ?? [])];
		if (dropped.length === 0) return;
		files = [...files, ...dropped];
	}

	async function uploadFiles(taskId: string) {
		for (const file of files) {
			const content = await fileToBase64(file);
			await addTaskAttachment({
				id: taskId,
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
		draftStore.clearDraft();
		onclose();
	}

	function backToLast() {
		const last = draftStore.last;
		if (!last) return;
		draftStore.save({
			values: { ...draft, tags: [...draft.tags] },
			title,
		});
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

			if (keepOpen) {
				reset();
			} else {
				onclose();
			}
		} catch (error) {
			failure = messageOf(error);
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
	ondragover={dragOver}
	ondragleave={dragLeave}
	ondrop={drop}
>
	<div class="panel-body">
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
			<div class="title-row">
				<input
					id="new-task-title"
					class="field-control"
					bind:this={titleInput}
					bind:value={title}
					placeholder="What needs to be done"
				/>
				<IconButton
					label="Attach a file"
					title="Attach a file"
					size="md"
					onclick={() => fileInput?.click()}
				>
					<Paperclip />
				</IconButton>
			</div>
		</div>

		<TaskFields
			value={draft}
			epics={epicOptions}
			{tagSuggestions}
			{tagCounts}
			advanced={ui.advanced}
			{onfield}
			onerror={(message) => {
				failure = message;
				invalidField = true;
			}}
		/>

		<div class="attachments">
			<div class="attachments-head">
				<span class="attachments-title">Attachments</span>
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
			</div>
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
	</div>

	<div class="modal-foot">
		<ErrorNote message={failure} />

		<div class="modal-actions">
			<label class="modal-check">
				<input type="checkbox" bind:checked={keepOpen} />
				Create another
				<kbd>Ctrl+Alt+C</kbd>
			</label>
			<AdvancedToggle
				count={advancedFilledCount(draft)}
				checked={ui.advanced}
				onchange={(value) => ui.set(value)}
			/>
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
			<button class="icon-button" type="button" onclick={cancel}>
				Cancel
			</button>
			<button class="new-task" type="submit" disabled={saving}>
				{saving ? "creating…" : "Create task"}
			</button>
		</div>
	</div>

	{#if dragging}
		<div class="drop-overlay" aria-hidden="true">
			<Upload />
			<span>Drop files to attach</span>
		</div>
	{/if}
</form>

<style>
	.attachments {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.attachments-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.attachments-title {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	form {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
		position: relative;
	}

	.drop-overlay {
		position: absolute;
		inset: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		border: 2px dashed var(--accent);
		border-radius: var(--radius);
		background: color-mix(in oklch, var(--panel) 82%, transparent);
		color: var(--text-secondary);
		font-size: var(--text-lg);
		font-weight: 600;
		pointer-events: none;
	}

	.drop-overlay :global(svg) {
		width: 2rem;
		height: 2rem;
		color: var(--accent);
	}

	.panel-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
	}

	.modal-foot {
		flex: none;
		margin: 0 calc(var(--modal-pad) * -1) calc(var(--modal-pad) * -1);
		padding: var(--space-3) var(--modal-pad) var(--modal-pad);
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.title-row :global(.field-control) {
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
