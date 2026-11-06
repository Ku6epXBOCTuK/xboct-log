<script lang="ts">
	import { untrack } from "svelte";
	import { cubicOut } from "svelte/easing";
	import AttachButton from "#lib/components/attachments/AttachButton.svelte";
	import TaskAttachments from "#lib/components/attachments/TaskAttachments.svelte";
	import CommentsOverlay from "#lib/components/detail/CommentsOverlay.svelte";
	import DetailActions from "#lib/components/detail/DetailActions.svelte";
	import DetailHeader from "#lib/components/detail/DetailHeader.svelte";
	import PanelOverlay from "#lib/components/detail/PanelOverlay.svelte";
	import TaskHistory from "#lib/components/detail/TaskHistory.svelte";
	import TaskRevisions from "#lib/components/detail/TaskRevisions.svelte";
	import TaskEditorFields from "#lib/components/task/TaskEditorFields.svelte";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import DropOverlay from "#lib/components/ui/DropOverlay.svelte";
	import { fileDrop } from "#lib/files/drop.ts";
	import { fieldNavigation } from "#lib/hotkeys/fields.ts";
	import { taskHrefFor } from "#lib/navigation/href.ts";
	import { createSavedAttachments } from "#lib/state/attachments.svelte.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { createTaskDraft } from "#lib/state/task-draft.ts";
	import type { TaskEditor } from "#lib/state/task-editor.ts";
	import { createTaskFinder } from "#lib/state/task-finder.svelte.ts";
	import { provideTaskPanel, type TaskPanel } from "#lib/state/task-panel.ts";
	import { blockingIds } from "#lib/tasks/blocking.ts";
	import {
		addConnection,
		connectionCandidates,
		removeConnection,
	} from "#lib/tasks/connections.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import {
		siblingEpics,
		type TaskPatch,
		validateTaskDraft,
	} from "#lib/tasks/fields.ts";
	import type { LinkField } from "#lib/tasks/links.ts";
	import {
		CLOSED_STATUSES,
		type ClosedReason,
		type Status,
		type Task,
	} from "#lib/types.ts";

	interface Props {
		task: Task;
		onclear: () => void;
		ondelete?: (id: string) => void;
		oncreatechild?: (task: Task) => void;
		onmoved?: (id: string) => void;
	}

	let { task, onclear, ondelete, oncreatechild, onmoved }: Props = $props();

	const { tasks, projects, scopes, tags, data, comments, stats, ui } =
		useBoard();

	let saving = $state(false);
	let failure = $state<string | null>(null);
	let historyOpen = $state(false);
	let commentsOpen = $state(false);
	const attachments = createSavedAttachments(
		() => task,
		() => tasks,
	);
	let dragging = $state(false);
	let projectData = $derived(data.of(task.project_id));
	let projectRepo = $derived(
		projects.all.find((project) => project.id === task.project_id)?.repo ??
			null,
	);
	let tagPicker = $derived(tags.picker(projectData?.tags ?? []));
	let epicProgress = $derived.by(() => {
		if (!task.is_epic) return null;
		const children = (projectData?.tasks ?? []).filter(
			(child) => child.epic_id === task.id,
		);
		if (children.length === 0) return null;
		return {
			closed: children.filter((child) => CLOSED_STATUSES.includes(child.status))
				.length,
			total: children.length,
		};
	});

	async function onunknowntag(name: string) {
		await tags.create(name);
	}

	const finder = createTaskFinder();
	const searchTasks = finder.search;

	const canMarkBlocked = $derived(
		(task.blocked_by ?? []).length > 0 &&
			task.status !== "blocked" &&
			task.status !== "done",
	);

	let candidates = $derived(
		connectionCandidates(projectData?.tasks ?? [], finder.found, task),
	);

	// NOTE: the derived value only changes when the task id changes, so a live
	// refresh of the task itself keeps the open overlay open.
	const taskId = $derived(task.id);

	$effect(() => {
		data.ensure(task.project_id);
	});

	$effect(() => {
		const referenced = [
			...(task.relates_to ?? []),
			...(task.duplicates ?? []),
			...(task.duplicated_by ?? []),
			...(task.blocked_by ?? []),
			...blockingIds(task),
		];
		const missing = referenced.filter(
			(id) => tasks.byId(id) === undefined && !tasks.isAbsent(id),
		);
		if (missing.length === 0) return;
		void tasks.pin(missing);
	});

	function unavailable(id: string): string | null {
		if (tasks.byId(id) !== undefined) return null;
		if (tasks.isAbsent(id)) return `${id} is unavailable: the task is gone`;
		if (tasks.isFailed(id)) return `${id} could not be loaded`;
		return `Loading ${id}…`;
	}

	$effect(() => {
		const id = taskId;
		comments.watch(id);
		void comments.load(id).catch(() => {});
	});

	async function perform(work: () => Promise<Task>) {
		saving = true;
		failure = null;

		try {
			await work();
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}

	function save(patch: TaskPatch) {
		void perform(() => tasks.save(task.id, patch));
	}

	const drafts = createTaskDraft({
		save: (id, patch) => void perform(() => tasks.save(id, patch)),
	});

	function draft(patch: TaskPatch) {
		drafts.draft(task.id, patch);
	}

	function cancelDraft() {
		drafts.cancel();
	}

	$effect(() => {
		const id = taskId;
		untrack(() => {
			drafts.release(id);
			historyOpen = false;
			commentsOpen = false;
		});
	});

	$effect(() => {
		const flush = drafts.flush;
		window.addEventListener("pagehide", flush);
		return () => window.removeEventListener("pagehide", flush);
	});

	$effect(() => () => drafts.flush());

	async function onnewscope(name: string): Promise<number> {
		const scope = await scopes.create({
			project_id: task.project_id,
			name,
		});
		return scope.id;
	}

	function moveTo(projectId: string) {
		if (projectId === task.project_id) return;
		void perform(async () => {
			const moved = await tasks.moveTo(task.id, projectId);
			onmoved?.(moved.id);
			return moved;
		});
	}

	function createChild() {
		oncreatechild?.(task);
	}

	function close(reason: ClosedReason) {
		void perform(() => tasks.close(task.id, reason));
	}

	function setStatus(status: Status) {
		save({ status });
	}

	function addLinkField(field: LinkField, id: string) {
		void perform(() => addConnection(tasks, task, field, id));
	}

	function removeLinkField(field: LinkField, id: string) {
		void perform(() => removeConnection(tasks, task, field, id));
	}

	function reopen() {
		save({ status: "open" });
	}

	function saveTitle(title: string) {
		const invalid = validateTaskDraft({ title });
		if (invalid !== null) {
			failure = invalid;
			return;
		}
		if (title.trim() === task.title) return;
		draft({ title: title.trim() });
	}

	async function remove() {
		const id = task.id;
		saving = true;
		failure = null;

		try {
			await tasks.destroy(id);
			onclear();
			ondelete?.(id);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}

	function slideRight(node: HTMLElement) {
		const width = node.offsetWidth;

		return {
			duration: 100,
			easing: cubicOut,
			css: (t: number) => `transform: translateX(${(1 - t) * width}px)`,
		};
	}

	function takeFiles(files: File[]) {
		void attachments.addFiles(files);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== "Escape") return;
		if (historyOpen) {
			historyOpen = false;
			return;
		}
		if (commentsOpen) {
			commentsOpen = false;
			return;
		}
		if (document.querySelector("dialog[open]") !== null) return;

		// NOTE: fields commit on change (blur), so the focused control must be
		// blurred before closing or its edit is lost.
		const active = document.activeElement;
		if (active instanceof HTMLElement) {
			active.blur();
		}

		// NOTE: a focused select swallows Escape (it belongs to the native
		// dropdown), so the first press only releases it; the second closes.
		if (active instanceof HTMLSelectElement) return;

		onclear();
	}

	const panel: TaskPanel = {
		get task() {
			return task;
		},
		get epicProgress() {
			return epicProgress;
		},
		get saving() {
			return saving;
		},
		get failure() {
			return failure;
		},
		get repo() {
			return projectRepo;
		},
		get historyOpen() {
			return historyOpen;
		},
		get commentsOpen() {
			return commentsOpen;
		},
		openHistory() {
			historyOpen = true;
		},
		closeHistory() {
			historyOpen = false;
		},
		openComments() {
			commentsOpen = true;
		},
		closeComments() {
			commentsOpen = false;
		},
		close: () => onclear(),
		closeTask: close,
		reopen,
		remove,
	};

	provideTaskPanel(panel);

	const editor = $derived<TaskEditor>({
		value: task,
		editing: true,
		taskId: task.id,
		repo: projectRepo,
		epics: siblingEpics(stats.epics, task),
		projects: projects.all,
		scopes: scopes.listFor(task.project_id),
		tagPicker,
		status: task.status,
		statusWarn: false,
		blockedReason: task.blocked_reason ?? "",
		commentsCount: comments.count(task.id),
		advancedOpen: ui.advanced,
		linkFields: {
			blocked_by: task.blocked_by ?? [],
			blocks: blockingIds(task),
			relates_to: task.relates_to ?? [],
			duplicates: task.duplicates ?? [],
			duplicated_by: task.duplicated_by ?? [],
		},
		linkCandidates: candidates.links,
		blockerCandidates: candidates.blockers,
		canMarkBlocked,
		busy: saving,
		onfield: save,
		onproject: moveTo,
		onnewscope,
		onerror: (message) => (failure = message),
		onstatus: setStatus,
		onblockedreason: (reason) => save({ blocked_reason: reason }),
		ondraft: draft,
		oncanceldraft: cancelDraft,
		oncreatechild: createChild,
		oncomments: () => (commentsOpen = true),
		onunknowntag,
		onlinkadd: addLinkField,
		onlinkremove: removeLinkField,
		linkHref: (id) => taskHrefFor(tasks.byId, id),
		onlinksearch: searchTasks,
		linkUnavailable: unavailable,
		onmarkblocked: () => setStatus("blocked"),
		onadvancedchange: (value) => ui.set(value),
	});
</script>

<svelte:window {onkeydown} />

<aside
	class="detail-panel"
	transition:slideRight
	aria-label="Task details"
	use:fieldNavigation={{ exclude: ".panel-overlay" }}
	use:fileDrop={{
		onfiles: takeFiles,
		ondragchange: (value) => (dragging = value),
	}}
>
	<DetailHeader />
	{#snippet attachmentSection()}
		<TaskAttachments store={attachments} />
	{/snippet}
	{#snippet titleTrailing()}
		<CopyButton text={task.title} label="copy title" />
		<AttachButton
			count={attachments.count}
			fresh={attachments.fresh}
			denied={attachments.denied}
			onpick={attachments.openPicker}
		/>
	{/snippet}
	<div class="panel-body">
		<TaskEditorFields
			{editor}
			title={task.title}
			titleId={`task-title-${task.id}`}
			{titleTrailing}
			ontitlecommit={saveTitle}
			ontitlefocus={cancelDraft}
			attachments={attachmentSection}
		/>
	</div>
	<DetailActions />
	{#if historyOpen}
		<PanelOverlay
			title="History"
			label="Task history"
			onback={() => (historyOpen = false)}
			onclose={onclear}
		>
			<TaskHistory {task} />
			<div class="previous-versions">
				<div class="previous-versions-heading">Previous versions</div>
				<TaskRevisions {task} />
			</div>
		</PanelOverlay>
	{/if}
	{#if commentsOpen}
		<CommentsOverlay />
	{/if}
	{#if dragging}
		<DropOverlay z={30} />
	{/if}
</aside>

<style>
	.detail-panel {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		z-index: 20;
		width: var(--detail-w);
		min-width: 0;
		border-left: 1px solid var(--border);
		background: var(--panel);
		box-shadow: -0.9375rem 0 2.5rem rgb(0 0 0 / 0.28);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-body {
		padding: var(--space-4) var(--edge-pad) var(--space-5);
	}

	.previous-versions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}

	.previous-versions-heading {
		font-size: var(--text-xl);
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	@media (max-width: 820px) {
		.detail-panel {
			width: min(var(--detail-w), calc(100vw - var(--sidebar-w)));
		}
	}

	@media (max-width: 560px) {
		.detail-panel {
			width: calc(100vw - var(--sidebar-w));
		}
	}
</style>
