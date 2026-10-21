<script lang="ts">
	import BlockingFields from "#lib/components/task/BlockingFields.svelte";
	import DetailActions from "#lib/components/detail/DetailActions.svelte";
	import ProjectScopeFields from "#lib/components/task/ProjectScopeFields.svelte";
	import TaskComments from "#lib/components/detail/TaskComments.svelte";
	import TaskHistory from "#lib/components/detail/TaskHistory.svelte";
	import TaskRevisions from "#lib/components/detail/TaskRevisions.svelte";
	import TaskFields from "#lib/components/task/TaskFields.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { CommentsStore } from "#lib/state/comments.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import { STATUS_LABELS, formatDate, messageOf } from "#lib/tasks/display.ts";
	import { blockingCandidates } from "#lib/tasks/blocking.ts";
	import { collectTags } from "#lib/tasks/filter.ts";
	import {
		siblingEpics,
		validateTaskDraft,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import type { ClosedReason, Status, Task } from "#lib/types.ts";
	import { cubicOut } from "svelte/easing";
	import ArrowLeft from "~icons/lucide/arrow-left";
	import Clock3 from "~icons/lucide/clock-3";
	import MessageSquare from "~icons/lucide/message-square";
	import RefreshCw from "~icons/lucide/refresh-cw";
	import X from "~icons/lucide/x";

	interface Props {
		selected: Task | null;
		tasks: TaskStore;
		projects: ProjectStore;
		scopes: ScopeStore;
		comments: CommentsStore;
		onclear: () => void;
		ondelete?: (id: string) => void;
		oncreatechild?: (task: Task) => void;
	}

	let {
		selected,
		tasks,
		projects,
		scopes,
		comments,
		onclear,
		ondelete,
		oncreatechild,
	}: Props = $props();

	let saving = $state(false);
	let failure = $state<string | null>(null);
	let historyOpen = $state(false);
	let commentsOpen = $state(false);
	let tagSuggestions = $derived(collectTags(tasks.tasks).map((tag) => tag.tag));
	let blockerCandidates = $derived(
		selected === null ? [] : blockingCandidates(tasks.tasks, selected),
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
	<aside class="detail-panel" transition:slideRight aria-label="Task details">
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
			<input
				class="title-input"
				value={selected.title}
				onchange={saveTitle}
				aria-label="Title"
			/>
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
				candidates={blockerCandidates}
				busy={saving}
				onstatus={setStatus}
				onadd={addBlocker}
				onremove={removeBlocker}
			/>
			<TaskFields
				value={selected}
				epics={siblingEpics(tasks.epics, selected)}
				{tagSuggestions}
				editing
				onfield={save}
				onerror={(message) => (failure = message)}
				oncreatechild={createChild}
				commentsCount={comments.count(selected.id)}
				oncomments={() => (commentsOpen = true)}
			/>
		</div>
		<DetailActions
			closed={selected.closed_at !== null}
			{saving}
			onclose={close}
			onreopen={reopen}
			ondelete={remove}
		/>
		{#if historyOpen}
			<div class="panel-overlay" role="dialog" aria-label="Task history">
				<div class="panel-overlay-head">
					<span class="panel-overlay-title">History</span>
					<div class="detail-actions">
						<IconButton
							label="Back to task details"
							title="Back to task details"
							onclick={() => (historyOpen = false)}
						>
							<ArrowLeft />
						</IconButton>
						<IconButton label="Close task details" onclick={onclear}>
							<X />
						</IconButton>
					</div>
				</div>
				<div class="panel-overlay-body">
					<TaskHistory task={selected} />
					<div class="previous-versions">
						<div class="panel-overlay-title">Previous versions</div>
						<TaskRevisions task={selected} />
					</div>
				</div>
			</div>
		{/if}
		{#if commentsOpen}
			<div class="panel-overlay" role="dialog" aria-label="Task comments">
				<div class="panel-overlay-head">
					<span class="panel-overlay-title">Comments</span>
					<div class="detail-actions">
						<IconButton
							label="Reload comments"
							title="Reload comments"
							onclick={() => {
								void comments.load(selected.id).catch(() => {});
							}}
						>
							<RefreshCw />
						</IconButton>
						<IconButton
							label="Back to task details"
							title="Back to task details"
							onclick={() => (commentsOpen = false)}
						>
							<ArrowLeft />
						</IconButton>
						<IconButton label="Close task details" onclick={onclear}>
							<X />
						</IconButton>
					</div>
				</div>
				<div class="panel-overlay-body">
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
				</div>
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

	.detail-head {
		flex: none;
		padding: var(--edge-pad) var(--edge-pad) 0;
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

	.panel-overlay {
		position: absolute;
		inset: 0;
		z-index: 20;
		background: var(--panel);
		display: flex;
		flex-direction: column;
	}

	.panel-overlay-head {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: var(--control-h);
		padding: var(--edge-pad);
		border-bottom: 1px solid var(--border);
	}

	.panel-overlay-title {
		font-size: var(--text-xl);
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.panel-overlay-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
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
