<script lang="ts">
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
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
		initialProject?: string;
		oncreated: (task: Task) => void;
		onclose: () => void;
	}

	let { tasks, projects, initialProject, oncreated, onclose }: Props = $props();

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
	let sourceFile = $state("");
	let sourceLine = $state("");
	let tags = $state("");
	let keepOpen = $state(false);
	let saving = $state(false);
	let failure = $state<string | null>(null);
	let titleInput = $state<HTMLInputElement | null>(null);

	const epicOptions = $derived(
		tasks.epics.filter((epic) => epic.project_id === projectId),
	);

	$effect(() => {
		titleInput?.focus();
	});

	function reset() {
		projectId = defaultProject();
		title = "";
		description = "";
		priority = "medium";
		type = "task";
		epicId = "";
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
	<label class="detail-field">
		Project
		<select bind:value={projectId}>
			{#each projects as project (project.id)}
				<option value={project.id}>{project.name}</option>
			{/each}
		</select>
	</label>

	<label class="detail-field">
		Title
		<input
			bind:this={titleInput}
			bind:value={title}
			placeholder="What needs to be done"
		/>
	</label>

	<label class="detail-field">
		Description
		<textarea bind:value={description} placeholder="Markdown"></textarea>
	</label>

	<div class="detail-grid">
		<label>
			Priority
			<select bind:value={priority}>
				{#each PRIORITIES as option (option)}
					<option value={option}>{option}</option>
				{/each}
			</select>
		</label>
		<label>
			Type
			<select bind:value={type}>
				<option value="task">task</option>
				<option value="epic">epic</option>
			</select>
		</label>
	</div>

	{#if type === "task"}
		<label class="detail-field">
			Epic
			<select bind:value={epicId}>
				<option value="">none</option>
				{#each epicOptions as epic (epic.id)}
					<option value={epic.id}>{epic.id} — {epic.title}</option>
				{/each}
			</select>
		</label>
	{/if}

	<label class="detail-field">
		Comma-separated tags
		<input bind:value={tags} placeholder="checkout, payments" />
	</label>

	<div class="detail-grid">
		<label>
			Source file
			<input bind:value={sourceFile} placeholder="src/app/PaymentForm.tsx" />
		</label>
		<label>
			Source line
			<input bind:value={sourceLine} placeholder="112" />
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
	label {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}

	input,
	select {
		width: 100%;
		border: 1px solid var(--border-strong);
		background: var(--field);
		color: var(--foreground);
		border-radius: var(--radius);
		padding: var(--space-2) var(--space-3);
		min-height: var(--control-h);
		outline: none;
		font-size: var(--text-md);
		font-weight: 400;
	}

	textarea {
		width: 100%;
		border: 1px solid var(--border-strong);
		background: var(--field);
		color: var(--foreground);
		border-radius: var(--radius);
		padding: var(--space-3);
		outline: none;
		font-size: var(--text-md);
		font-weight: 400;
		resize: vertical;
		min-height: 8rem;
		line-height: 1.55;
	}

	input:focus,
	select:focus,
	textarea:focus {
		border-color: var(--accent);
	}

	.modal-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-5);
	}

	.modal-check {
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
