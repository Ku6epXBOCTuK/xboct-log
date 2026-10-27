<script lang="ts">
	import BlockingFields from "#lib/components/task/BlockingFields.svelte";
	import TaskLinks from "#lib/components/task/TaskLinks.svelte";
	import DetailActions from "#lib/components/detail/DetailActions.svelte";
	import ProjectScopeFields from "#lib/components/task/ProjectScopeFields.svelte";
	import TaskComments from "#lib/components/detail/TaskComments.svelte";
	import TaskHistory from "#lib/components/detail/TaskHistory.svelte";
	import TaskRevisions from "#lib/components/detail/TaskRevisions.svelte";
	import PanelOverlay from "#lib/components/detail/PanelOverlay.svelte";
	import TaskAttachments from "#lib/components/attachments/TaskAttachments.svelte";
	import TaskFields from "#lib/components/task/TaskFields.svelte";
	import { fieldNavigation } from "#lib/hotkeys/fields.ts";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ProjectDataStore } from "#lib/state/project-data.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { CommentsStore } from "#lib/state/comments.svelte.ts";
	import type { TagStore } from "#lib/state/tags.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import type { UiStore } from "#lib/state/ui.svelte.ts";
	import AdvancedToggle from "#lib/components/task/AdvancedToggle.svelte";
	import { STATUS_LABELS, formatDate, messageOf } from "#lib/tasks/display.ts";
	import { blockingCandidates, blockingIds } from "#lib/tasks/blocking.ts";
	import { taskText } from "#lib/tasks/clipboard.ts";
	import { advancedFilledCount } from "#lib/tasks/fields.ts";
	import {
		siblingEpics,
		validateTaskDraft,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import { CLOSED_STATUSES } from "#lib/types.ts";
	import type { ClosedReason, Status, Task } from "#lib/types.ts";
	import { fetchFresh } from "#lib/remote/fresh.ts";
	import { getTaskOptions } from "#lib/remote/options.remote.ts";
	import { createDebouncedValue } from "#lib/state/debounce.svelte.ts";
	import { cubicOut } from "svelte/easing";
	import Clock3 from "~icons/lucide/clock-3";
	import MessageSquare from "~icons/lucide/message-square";
	import RefreshCw from "~icons/lucide/refresh-cw";
	import Upload from "~icons/lucide/upload";
	import X from "~icons/lucide/x";

	interface Props {
		selected: Task | null;
		tasks: TaskStore;
		projects: ProjectStore;
		scopes: ScopeStore;
		tags: TagStore;
		data: ProjectDataStore;
		comments: CommentsStore;
		ui: UiStore;
		onclear: () => void;
		ondelete?: (id: string) => void;
		oncreatechild?: (task: Task) => void;
		onopen?: (id: string) => void;
	}

	let {
		selected,
		tasks,
		projects,
		scopes,
		tags,
		data,
		comments,
		ui,
		onclear,
		ondelete,
		oncreatechild,
		onopen,
	}: Props = $props();

	let saving = $state(false);
	let failure = $state<string | null>(null);
	let historyOpen = $state(false);
	let commentsOpen = $state(false);
	let attachments: TaskAttachments | undefined = $state();
	let dragging = $state(false);
	let projectData = $derived(
		selected === null ? undefined : data.of(selected.project_id),
	);
	let tagEntries = $derived(tags.ordered(projectData?.tags ?? []));
	let tagSuggestions = $derived(tagEntries.map((entry) => entry.tag));
	let tagCounts = $derived(
		Object.fromEntries(tagEntries.map((entry) => [entry.tag, entry.count])),
	);
	async function onunknowntag(name: string) {
		await tags.create(name);
	}

	const search = createDebouncedValue("");
	let found = $state<Task[]>([]);
	let searchRequest = 0;

	function searchTasks(query: string) {
		search.set(query);
	}

	$effect(() => {
		const text = search.applied.trim();
		if (text === "") {
			found = [];
			return;
		}
		const current = ++searchRequest;
		void fetchFresh(getTaskOptions({ q: text }))
			.then((page) => {
				if (current !== searchRequest) return;
				found = page.items;
			})
			.catch(() => {
				if (current === searchRequest) found = [];
			});
	});

	$effect(() => () => search.cancel());

	function append(base: Task[], extra: Task[]): Task[] {
		const ids = new Set(base.map((task) => task.id));
		return [...base, ...extra.filter((task) => !ids.has(task.id))];
	}

	function isLinkCandidate(task: Task): boolean {
		if (selected === null || task.id === selected.id) return false;
		if (CLOSED_STATUSES.includes(task.status)) return false;
		return (
			!(selected.relates_to ?? []).includes(task.id) &&
			!(selected.duplicates ?? []).includes(task.id) &&
			!(selected.duplicated_by ?? []).includes(task.id)
		);
	}

	let blockerCandidates = $derived(
		selected === null
			? []
			: append(
					blockingCandidates(projectData?.tasks ?? [], selected),
					blockingCandidates(found, selected),
				),
	);
	let linkCandidates = $derived(
		selected === null
			? []
			: append(
					(projectData?.tasks ?? []).filter(isLinkCandidate),
					found.filter(isLinkCandidate),
				),
	);

	// NOTE: the derived value only changes when the task id changes, so a live
	// refresh of the task itself keeps the open overlay open.
	const selectedId = $derived(selected?.id);

	$effect(() => {
		const id = selectedId;
		if (id === undefined) return;
		historyOpen = false;
		commentsOpen = false;
	});

	$effect(() => {
		const projectId = selected?.project_id;
		if (projectId === undefined) return;
		data.ensure(projectId);
	});

	$effect(() => {
		const current = selected;
		if (current === null) return;
		const referenced = [
			...(current.relates_to ?? []),
			...(current.duplicates ?? []),
			...(current.duplicated_by ?? []),
			...(current.blocked_by ?? []),
			...blockingIds(current),
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
		const id = selectedId;
		comments.watch(id ?? null);
		if (id === undefined) return;
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
		const current = selected;
		if (current === null) return;
		void perform(() => tasks.save(current.id, patch));
	}

	async function onnewscope(name: string): Promise<number> {
		const current = selected;
		if (current === null) throw new Error("no task selected");
		const scope = await scopes.create({
			project_id: current.project_id,
			name,
		});
		return scope.id;
	}

	function saveTitle(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const invalid = validateTaskDraft({ title: input.value });

		if (invalid !== null) {
			failure = invalid;
			input.value = selected?.title ?? "";
			return;
		}

		save({ title: input.value.trim() });
	}

	function moveTo(projectId: string) {
		const current = selected;
		if (current === null || projectId === current.project_id) return;
		void perform(() => tasks.moveTo(current.id, projectId));
	}

	function createChild() {
		const current = selected;
		if (current === null) return;
		oncreatechild?.(current);
	}

	function close(reason: ClosedReason) {
		const current = selected;
		if (current === null) return;
		void perform(() => tasks.close(current.id, reason));
	}

	function setStatus(status: Status) {
		save({ status });
	}

	function addBlocker(blockerId: string) {
		const current = selected;
		if (current === null) return;
		void perform(() => tasks.addBlocker(current.id, blockerId));
	}

	function removeBlocker(blockerId: string) {
		const current = selected;
		if (current === null) return;
		void perform(() => tasks.removeBlocker(current.id, blockerId));
	}

	function addLinkField(
		field: "relates_to" | "duplicates" | "duplicated_by",
		id: string,
	) {
		const current = selected;
		if (current === null) return;
		if (field === "duplicated_by") {
			void perform(() => tasks.addLink(id, "duplicates", current.id));
			return;
		}
		void perform(() => tasks.addLink(current.id, field, id));
	}

	function removeLinkField(
		field: "relates_to" | "duplicates" | "duplicated_by",
		id: string,
	) {
		const current = selected;
		if (current === null) return;
		if (field === "duplicated_by") {
			void perform(() => tasks.removeLink(id, "duplicates", current.id));
			return;
		}
		void perform(() => tasks.removeLink(current.id, field, id));
	}

	function reopen() {
		save({ status: "open" });
	}

	async function remove() {
		const current = selected;
		if (current === null) return;

		const id = current.id;
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

	function dragOver(event: DragEvent) {
		if (event.dataTransfer?.types.includes("Files") !== true) return;
		event.preventDefault();
		dragging = true;
	}

	function dragLeave(event: DragEvent) {
		const panel = event.currentTarget;
		const related = event.relatedTarget;
		if (
			panel instanceof Node &&
			related instanceof Node &&
			panel.contains(related)
		) {
			return;
		}
		dragging = false;
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		void attachments?.addFiles([...(event.dataTransfer?.files ?? [])]);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== "Escape") return;
		if (selected === null) return;
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
</script>

<svelte:window {onkeydown} />

{#if selected !== null}
	<aside
		class="detail-panel"
		transition:slideRight
		aria-label="Task details"
		use:fieldNavigation={{ exclude: ".panel-overlay" }}
		ondragover={dragOver}
		ondragleave={dragLeave}
		ondrop={drop}
	>
		<div class="detail-head">
			<div class="detail-top">
				<div class="detail-id">
					<span class="epic-badge">{selected.id}</span>
					<StatusDot status={selected.status} />
					<span>{STATUS_LABELS[selected.status]}</span>
					<span class="muted">
						{saving
							? "saving…"
							: selected.updated_at == null
								? ""
								: `updated ${formatDate(selected.updated_at)}`}
					</span>
				</div>
				<div class="detail-actions">
					<CopyButton
						text={taskText(selected.title, selected.description)}
						label="Copy title and description"
						title="Copy title and description"
					/>
					<IconButton
						label="Task history"
						title="Task history"
						onclick={() => (historyOpen = true)}
					>
						<Clock3 />
					</IconButton>
					<IconButton
						label="Task comments"
						title="Task comments"
						onclick={() => (commentsOpen = true)}
					>
						<MessageSquare />
					</IconButton>
					<IconButton label="Close task details" onclick={onclear}>
						<X />
					</IconButton>
				</div>
			</div>
			<div class="title-row">
				<input
					class="title-input"
					value={selected.title}
					onchange={saveTitle}
					aria-label="Title"
				/>
				<CopyButton
					text={selected.title}
					label="Copy title"
					title="Copy title"
				/>
			</div>
			<ErrorNote message={failure} />
		</div>
		<div class="panel-body">
			<ProjectScopeFields
				value={selected}
				projects={projects.all}
				scopes={scopes.listFor(selected.project_id)}
				editing
				onfield={save}
				onproject={moveTo}
				{onnewscope}
			/>
			<BlockingFields
				status={selected.status}
				blockedBy={selected.blocked_by ?? []}
				blocks={blockingIds(selected)}
				blockedReason={selected.blocked_reason ?? ""}
				candidates={blockerCandidates}
				busy={saving}
				onstatus={setStatus}
				onadd={addBlocker}
				onremove={removeBlocker}
				onreason={(reason) => save({ blocked_reason: reason })}
				{onopen}
				onsearch={searchTasks}
				{unavailable}
			/>
			<TaskLinks
				relatesTo={selected.relates_to ?? []}
				duplicates={selected.duplicates ?? []}
				duplicatedBy={selected.duplicated_by ?? []}
				candidates={linkCandidates}
				onadd={addLinkField}
				onremove={removeLinkField}
				{onopen}
				onsearch={searchTasks}
				{unavailable}
			/>
			<TaskFields
				value={selected}
				epics={siblingEpics(tasks.epics, selected)}
				{tagSuggestions}
				{tagCounts}
				{onunknowntag}
				editing
				advanced={ui.advanced}
				onfield={save}
				onerror={(message) => (failure = message)}
				oncreatechild={createChild}
				commentsCount={comments.count(selected.id)}
				oncomments={() => (commentsOpen = true)}
			/>
			<div class="advanced-row">
				<AdvancedToggle
					count={advancedFilledCount(selected)}
					checked={ui.advanced}
					onchange={(value) => ui.set(value)}
				/>
			</div>
			<TaskAttachments bind:this={attachments} task={selected} {tasks} />
		</div>
		<DetailActions
			closed={selected.closed_at !== null}
			{saving}
			onclose={close}
			onreopen={reopen}
			ondelete={remove}
		/>
		{#if historyOpen}
			<PanelOverlay
				title="History"
				label="Task history"
				onback={() => (historyOpen = false)}
				onclose={onclear}
			>
				<TaskHistory task={selected} />
				<div class="previous-versions">
					<div class="previous-versions-heading">Previous versions</div>
					<TaskRevisions task={selected} />
				</div>
			</PanelOverlay>
		{/if}
		{#if commentsOpen}
			<PanelOverlay
				title="Comments"
				label="Task comments"
				onback={() => (commentsOpen = false)}
				onclose={onclear}
			>
				{#snippet actions()}
					<IconButton
						label="Reload comments"
						title="Reload comments"
						onclick={() => {
							void comments.load(selected.id).catch(() => {});
						}}
					>
						<RefreshCw />
					</IconButton>
				{/snippet}
				<div class="task-summary">
					<div class="summary-title">{selected.title}</div>
					<div class="summary-meta">
						<span class="epic-badge">{selected.id}</span>
						<StatusDot status={selected.status} />
						<span>{STATUS_LABELS[selected.status]}</span>
					</div>
					{#if selected.description.trim() !== ""}
						<p class="summary-description">{selected.description}</p>
					{/if}
				</div>
				<TaskComments taskId={selected.id} {comments} />
			</PanelOverlay>
		{/if}
		{#if dragging}
			<div class="drop-overlay" aria-hidden="true">
				<Upload />
				<span>Drop files to attach</span>
			</div>
		{/if}
	</aside>
{/if}

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

	.drop-overlay {
		position: absolute;
		inset: 0;
		z-index: 30;
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

	.detail-head {
		flex: none;
		padding: var(--edge-pad) var(--edge-pad) 0;
	}

	.advanced-row {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--space-3);
	}

	.panel-body {
		padding: var(--space-4) var(--edge-pad) var(--space-5);
	}

	.detail-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
	}

	.detail-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex: none;
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

	.task-summary {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--border);
	}

	.summary-title {
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.3;
	}

	.summary-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.summary-description {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.detail-id {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.muted {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.title-row :global(.icon-btn) {
		margin-top: var(--space-3);
	}

	.title-input {
		width: 100%;
		font-size: var(--text-xl);
		line-height: 1.25;
		margin: var(--space-3) 0 0;
		letter-spacing: -0.02em;
		font-weight: 600;
		color: var(--foreground);
		background: transparent;
		border: 0;
		border-bottom: 1px solid transparent;
		border-radius: 0;
		padding: 0 0 var(--space-1);
		min-height: 2.5rem;
	}

	.title-input:focus {
		border-bottom-color: var(--accent);
		box-shadow: none;
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
