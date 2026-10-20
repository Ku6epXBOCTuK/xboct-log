<script lang="ts">
	import DetailActions from "#lib/components/detail/DetailActions.svelte";
	import ProjectScopeFields from "#lib/components/task/ProjectScopeFields.svelte";
	import TaskFields from "#lib/components/task/TaskFields.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import { STATUS_LABELS, formatDate, messageOf } from "#lib/tasks/display.ts";
	import { collectTags } from "#lib/tasks/filter.ts";
	import {
		siblingEpics,
		validateTaskDraft,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import type { ClosedReason, Task } from "#lib/types.ts";
	import { cubicOut } from "svelte/easing";
	import X from "~icons/lucide/x";

	interface Props {
		selected: Task | null;
		tasks: TaskStore;
		projects: ProjectStore;
		scopes: ScopeStore;
		onclear: () => void;
		ondelete?: (id: string) => void;
		oncreatechild?: (task: Task) => void;
	}

	let {
		selected,
		tasks,
		projects,
		scopes,
		onclear,
		ondelete,
		oncreatechild,
	}: Props = $props();

	let saving = $state(false);
	let failure = $state<string | null>(null);
	let tagSuggestions = $derived(collectTags(tasks.tasks).map((tag) => tag.tag));

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
				<IconButton label="Close task details" onclick={onclear}>
					<X />
				</IconButton>
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
			/>
			<TaskFields
				value={selected}
				epics={siblingEpics(tasks.epics, selected)}
				{tagSuggestions}
				editing
				onfield={save}
				onerror={(message) => (failure = message)}
				oncreatechild={createChild}
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
		position: relative;
		z-index: 10;
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
