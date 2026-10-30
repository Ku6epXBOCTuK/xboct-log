<script lang="ts">
	import TaskAttachments from "#lib/components/attachments/TaskAttachments.svelte";
	import CommentsOverlay from "#lib/components/detail/CommentsOverlay.svelte";
	import DetailActions from "#lib/components/detail/DetailActions.svelte";
	import DetailHeader from "#lib/components/detail/DetailHeader.svelte";
	import PanelOverlay from "#lib/components/detail/PanelOverlay.svelte";
	import TaskHistory from "#lib/components/detail/TaskHistory.svelte";
	import TaskRevisions from "#lib/components/detail/TaskRevisions.svelte";
	import AdvancedFields from "#lib/components/task/AdvancedFields.svelte";
	import ProjectScopeFields from "#lib/components/task/ProjectScopeFields.svelte";
	import TaskFields from "#lib/components/task/TaskFields.svelte";
	import TaskLinks from "#lib/components/task/TaskLinks.svelte";
	import DropOverlay from "#lib/components/ui/DropOverlay.svelte";
	import SectionDivider from "#lib/components/ui/SectionDivider.svelte";
	import { fieldNavigation } from "#lib/hotkeys/fields.ts";
	import { fileDrop } from "#lib/files/drop.ts";
	import type { CommentsStore } from "#lib/state/comments.svelte.ts";
	import type { ProjectDataStore } from "#lib/state/project-data.svelte.ts";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TagStore } from "#lib/state/tags.svelte.ts";
	import { createTaskDraft } from "#lib/state/task-draft.ts";
	import { createTaskFinder } from "#lib/state/task-finder.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import type { UiStore } from "#lib/state/ui.svelte.ts";
	import { blockingIds } from "#lib/tasks/blocking.ts";
	import {
		addConnection,
		connectionCandidates,
		removeConnection,
	} from "#lib/tasks/connections.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import {
		advancedFilledCount,
		siblingEpics,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import type { LinkField } from "#lib/tasks/links.ts";
	import type { ClosedReason, Status, Task } from "#lib/types.ts";
	import { untrack } from "svelte";
	import { cubicOut } from "svelte/easing";

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

	const finder = createTaskFinder();
	const searchTasks = finder.search;

	const canMarkBlocked = $derived(
		selected !== null &&
			(selected.blocked_by ?? []).length > 0 &&
			selected.status !== "blocked" &&
			selected.status !== "done",
	);

	let candidates = $derived(
		selected === null
			? { blockers: [], links: [] }
			: connectionCandidates(projectData?.tasks ?? [], finder.found, selected),
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

	const drafts = createTaskDraft({
		save: (id, patch) => void perform(() => tasks.save(id, patch)),
	});

	function draft(patch: TaskPatch) {
		const current = selected;
		if (current === null) return;
		drafts.draft(current.id, patch);
	}

	function cancelDraft() {
		drafts.cancel();
	}

	$effect(() => {
		const id = selectedId ?? null;
		untrack(() => drafts.release(id));
	});

	$effect(() => {
		const flush = drafts.flush;
		window.addEventListener("pagehide", flush);
		return () => window.removeEventListener("pagehide", flush);
	});

	async function onnewscope(name: string): Promise<number> {
		const current = selected;
		if (current === null) throw new Error("no task selected");
		const scope = await scopes.create({
			project_id: current.project_id,
			name,
		});
		return scope.id;
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

	function addLinkField(field: LinkField, id: string) {
		const current = selected;
		if (current === null) return;
		void perform(() => addConnection(tasks, current, field, id));
	}

	function removeLinkField(field: LinkField, id: string) {
		const current = selected;
		if (current === null) return;
		void perform(() => removeConnection(tasks, current, field, id));
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

	function takeFiles(files: File[]) {
		void attachments?.addFiles(files);
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
		use:fileDrop={{
			onfiles: takeFiles,
			ondragchange: (value) => (dragging = value),
		}}
	>
		<DetailHeader
			task={selected}
			{saving}
			{failure}
			onrename={(title) => draft({ title })}
			onerror={(message) => (failure = message)}
			onhistory={() => (historyOpen = true)}
			oncomments={() => (commentsOpen = true)}
			onclose={onclear}
			oncanceldraft={cancelDraft}
		/>
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
			<TaskFields
				value={selected}
				epics={siblingEpics(tasks.epics, selected)}
				taskId={selected.id}
				{tagSuggestions}
				{tagCounts}
				{onunknowntag}
				editing
				status={selected.status}
				onstatus={setStatus}
				blockedReason={selected.blocked_reason ?? ""}
				onblockedreason={(reason) => save({ blocked_reason: reason })}
				onfield={save}
				ondraft={draft}
				oncanceldraft={cancelDraft}
				oncreatechild={createChild}
				commentsCount={comments.count(selected.id)}
				oncomments={() => (commentsOpen = true)}
			/>
			<TaskLinks
				blockedBy={selected.blocked_by ?? []}
				blocks={blockingIds(selected)}
				relatesTo={selected.relates_to ?? []}
				duplicates={selected.duplicates ?? []}
				duplicatedBy={selected.duplicated_by ?? []}
				candidates={candidates.links}
				blockerCandidates={candidates.blockers}
				onadd={addLinkField}
				onremove={removeLinkField}
				{onopen}
				onsearch={searchTasks}
				{unavailable}
				{canMarkBlocked}
				busy={saving}
				onmarkblocked={() => setStatus("blocked")}
			/>
			<SectionDivider
				title="Advanced"
				count={advancedFilledCount(selected)}
				open={ui.advanced}
				onopenchange={(value) => ui.set(value)}
			>
				<AdvancedFields
					value={selected}
					onfield={save}
					onerror={(message) => (failure = message)}
				/>
			</SectionDivider>
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
			<CommentsOverlay
				task={selected}
				{comments}
				onback={() => (commentsOpen = false)}
				onclose={onclear}
			/>
		{/if}
		{#if dragging}
			<DropOverlay z={30} />
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
