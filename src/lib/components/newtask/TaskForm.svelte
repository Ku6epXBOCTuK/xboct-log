<script lang="ts">
	import ProjectScopeFields from "#lib/components/task/ProjectScopeFields.svelte";
	import TaskFields from "#lib/components/task/TaskFields.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import {
		validateTaskDraft,
		type TaskFieldValues,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import { INBOX_PROJECT_ID, type Project } from "#lib/types.ts";

	interface Props {
		tasks: TaskStore;
		projects: Project[];
		scopes: ScopeStore;
		initialProject?: string;
		initialEpic?: string | null;
		initialScope?: number | null;
		onclose: () => void;
	}

	let {
		tasks,
		projects,
		scopes,
		initialProject,
		initialEpic = null,
		initialScope = null,
		onclose,
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
			source_line: null,
			tags: [],
			description: "",
		};
	}

	let draft = $state<TaskFieldValues>(blankDraft());
	let title = $state("");
	let keepOpen = $state(false);
	let saving = $state(false);
	let failure = $state<string | null>(null);
	let invalidField = $state(false);
	let titleInput = $state<HTMLInputElement | null>(null);
	let formElement = $state<HTMLFormElement | null>(null);

	const epicOptions = $derived(
		tasks.epics.filter((epic) => epic.project_id === draft.project_id),
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
		failure = null;
		invalidField = false;
	}

	function onfield(patch: TaskPatch) {
		Object.assign(draft, patch);
		failure = null;
		invalidField = false;
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

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== "Enter") return;
		if (!event.ctrlKey && !event.metaKey) return;

		event.preventDefault();

		if (saving) return;

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
			source_line: draft.source_line === null ? "" : String(draft.source_line),
		});

		if (invalid !== null) {
			failure = invalid;
			return;
		}

		saving = true;

		try {
			await tasks.create({
				project_id: draft.project_id,
				title: title.trim(),
				description: draft.description,
				priority: draft.priority,
				is_epic: draft.is_epic,
				epic_id: draft.is_epic ? null : draft.epic_id,
				scope_id: draft.scope_id,
				source_file: draft.source_file,
				source_line: draft.source_line,
				tags: draft.tags,
			});

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

<svelte:window {onkeydown} />

<form bind:this={formElement} onsubmit={submit}>
	<div class="panel-body">
		<ProjectScopeFields
			value={draft}
			{projects}
			scopes={scopeOptions}
			{onfield}
			{onproject}
		/>

		<label class="field detail-field">
			Title
			<input
				class="field-control"
				bind:this={titleInput}
				bind:value={title}
				placeholder="What needs to be done"
			/>
		</label>

		<TaskFields
			value={draft}
			epics={epicOptions}
			{onfield}
			onerror={(message) => {
				failure = message;
				invalidField = true;
			}}
		/>
	</div>

	<div class="modal-foot">
		<ErrorNote message={failure} />

		<div class="modal-actions">
			<label class="modal-check">
				<input type="checkbox" bind:checked={keepOpen} />
				Create another
			</label>
			<button class="icon-button" type="button" onclick={onclose}>
				Cancel
			</button>
			<button class="new-task" type="submit" disabled={saving}>
				{saving ? "creating…" : "Create task"}
			</button>
		</div>
	</div>
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
	}

	.panel-body {
		padding: 0 var(--edge-pad);
	}

	.modal-foot {
		flex: none;
		padding: 0 var(--edge-pad) var(--edge-pad);
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
</style>
