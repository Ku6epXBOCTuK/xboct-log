<script lang="ts">
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import { splitTags, toSourceFile, toSourceLine } from "#lib/tasks/fields.ts";
	import {
		INBOX_PROJECT_ID,
		PRIORITIES,
		type Priority,
		type Project,
		type Task,
	} from "#lib/types.ts";

	interface Props {
		tasks: TaskStore;
		projects: Project[];
		scopes: ScopeStore;
		initialProject?: string;
		oncreated: (task: Task) => void;
		onclose: () => void;
	}

	let { tasks, projects, scopes, initialProject, oncreated, onclose }: Props =
		$props();

	function defaultProject(): string {
		if (initialProject !== undefined) return initialProject;
		if (projects.some((project) => project.id === INBOX_PROJECT_ID)) {
			return INBOX_PROJECT_ID;
		}
		return projects[0]?.id ?? "";
	}

	let projectId = $state(defaultProject());
	let title = $state("");
	let description = $state("");
	let priority = $state<Priority>("medium");
	let type = $state<"task" | "epic">("task");
	let epicId = $state("");
	let scopeId = $state("");
	let sourceFile = $state("");
	let sourceLine = $state("");
	let tags = $state("");
	let keepOpen = $state(false);
	let saving = $state(false);
	let failure = $state<string | null>(null);
	let titleInput = $state<HTMLInputElement | null>(null);
	let scopeProject: string | undefined = undefined;

	const epicOptions = $derived(
		tasks.epics.filter((epic) => epic.project_id === projectId),
	);
	const scopeOptions = $derived(scopes.listFor(projectId));

	$effect(() => {
		titleInput?.focus();
	});

	$effect(() => {
		if (scopeProject === projectId) return;
		scopeProject = projectId;
		scopeId = "";
	});

	function reset() {
		projectId = defaultProject();
		title = "";
		description = "";
		priority = "medium";
		type = "task";
		epicId = "";
		scopeId = "";
		sourceFile = "";
		sourceLine = "";
		tags = "";
		failure = null;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		failure = null;

		const cleanTitle = title.trim();

		if (projectId === "") {
			failure = "create a project first";
			return;
		}

		if (cleanTitle === "") {
			failure = "title cannot be empty";
			return;
		}

		const line = toSourceLine(sourceLine);
		if (line !== null && !Number.isInteger(line)) {
			failure = "source line must be a whole number";
			return;
		}

		const file = toSourceFile(sourceFile);
		if (line !== null && file === null) {
			failure = "source line requires source file";
			return;
		}

		saving = true;

		try {
			const created = await tasks.create({
				project_id: projectId,
				title: cleanTitle,
				description,
				priority,
				is_epic: type === "epic",
				epic_id: type === "epic" || epicId === "" ? null : epicId,
				scope_id: scopeId === "" ? null : Number(scopeId),
				source_file: file,
				source_line: line,
				tags: splitTags(tags),
			});

			oncreated(created);

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

<form onsubmit={submit}>
	<label class="field detail-field">
		Project
		<select class="field-control" bind:value={projectId}>
			{#each projects as project (project.id)}
				<option value={project.id}>{project.name}</option>
			{/each}
		</select>
	</label>

	<label class="field detail-field">
		Title
		<input
			class="field-control"
			bind:this={titleInput}
			bind:value={title}
			placeholder="What needs to be done"
		/>
	</label>

	<label class="field detail-field">
		Description
		<textarea
			class="field-control"
			bind:value={description}
			placeholder="Markdown"></textarea>
	</label>

	<div class="detail-grid">
		<label class="field">
			Priority
			<select class="field-control" bind:value={priority}>
				{#each PRIORITIES as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			Type
			<select class="field-control" bind:value={type}>
				<option value="task">task</option>
				<option value="epic">epic</option>
			</select>
		</label>
	</div>

	{#if type === "task"}
		<label class="field detail-field">
			Epic
			<select class="field-control" bind:value={epicId}>
				<option value="">none</option>
				{#each epicOptions as epic (epic.id)}
					<option value={epic.id}>{epic.id} — {epic.title}</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if scopeOptions.length > 0}
		<label class="field detail-field">
			Scope
			<select class="field-control" bind:value={scopeId}>
				<option value="">not selected</option>
				{#each scopeOptions as scope (scope.id)}
					<option value={String(scope.id)}>{scope.name}</option>
				{/each}
			</select>
		</label>
	{/if}

	<label class="field detail-field">
		Comma-separated tags
		<input
			class="field-control"
			bind:value={tags}
			placeholder="checkout, payments"
		/>
	</label>

	<div class="detail-grid">
		<label class="field">
			Source file
			<input
				class="field-control"
				bind:value={sourceFile}
				placeholder="src/app/PaymentForm.tsx"
			/>
		</label>
		<label class="field">
			Source line
			<input class="field-control" bind:value={sourceLine} placeholder="112" />
		</label>
	</div>

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
</form>

<style>
	.modal-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-5);
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
