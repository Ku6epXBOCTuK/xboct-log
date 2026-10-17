<script lang="ts">
	import TaskFields from "#lib/components/task/TaskFields.svelte";
	import DetailActions from "#lib/components/detail/DetailActions.svelte";
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import { STATUS_LABELS, formatDate, messageOf } from "#lib/tasks/display.ts";
	import {
		siblingEpics,
		validateTaskDraft,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import type { ClosedReason, Task } from "#lib/types.ts";
	import X from "~icons/lucide/x";

	interface Props {
		selected: Task | null;
		tasks: TaskStore;
		projects: ProjectStore;
		scopes: ScopeStore;
		ondelete?: (id: string) => void;
	}

	let {
		selected = $bindable(),
		tasks,
		projects,
		scopes,
		ondelete,
	}: Props = $props();

	let saving = $state(false);
	let failure = $state<string | null>(null);

	async function perform(id: string, work: () => Promise<Task>) {
		saving = true;
		failure = null;

		try {
			const updated = await work();
			if (selected?.id === id) selected = updated;
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}

	function save(patch: TaskPatch) {
		const current = selected;
		if (current === null) return;
		void perform(current.id, () => tasks.save(current.id, patch));
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
		void perform(current.id, () => tasks.moveTo(current.id, projectId));
	}

	function close(reason: ClosedReason) {
		const current = selected;
		if (current === null) return;
		void perform(current.id, () => tasks.close(current.id, reason));
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
			if (selected?.id === id) selected = null;
			ondelete?.(id);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}
</script>

{#if selected !== null}
	<aside class="detail-panel" aria-label="Task details">
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
				<button
					class="close-detail"
					onclick={() => (selected = null)}
					aria-label="Close task details"
				>
					<X />
				</button>
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
			<TaskFields
				value={selected}
				projects={projects.all}
				epics={siblingEpics(tasks.epics, selected)}
				scopes={scopes.listFor(selected.project_id)}
				editing
				onfield={save}
				onproject={moveTo}
				onerror={(message) => (failure = message)}
			/>
		</div>
		<DetailActions
			closed={selected.closed_at !== null}
			{saving}
			onclose={close}
			onreopen={reopen}
			ondelete={remove}
		/>
	</aside>
{/if}

<style>
	.detail-panel {
		width: var(--detail-w);
		min-width: var(--detail-w);
		height: 100%;
		border-left: 1px solid var(--border);
		background: var(--panel);
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
			position: fixed;
			right: 0;
			top: 0;
			width: min(var(--detail-w), calc(100vw - var(--sidebar-w)));
			min-width: 0;
			box-shadow: -0.9375rem 0 2.5rem rgb(0 0 0 / 0.5);
			z-index: 5;
		}
	}

	@media (max-width: 560px) {
		.detail-panel {
			width: calc(100vw - var(--sidebar-w));
		}
	}
</style>
