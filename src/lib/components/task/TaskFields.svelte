<script lang="ts">
	import { STATUS_LABELS, formatDate } from "#lib/tasks/display.ts";
	import {
		splitTags,
		toSourceFile,
		toSourceLine,
		validateTaskDraft,
		type TaskFieldValues,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import type { Priority, Project, Scope, Status, Task } from "#lib/types.ts";
	import { PRIORITIES, STATUSES } from "#lib/types.ts";

	interface Props {
		value: TaskFieldValues;
		projects: Project[];
		epics: Task[];
		scopes: Scope[];
		editing?: boolean;
		onfield: (patch: TaskPatch) => void;
		onproject: (projectId: string) => void;
		onerror: (message: string) => void;
	}

	let {
		value,
		projects,
		epics,
		scopes,
		editing = false,
		onfield,
		onproject,
		onerror,
	}: Props = $props();

	function changePriority(event: Event) {
		onfield({
			priority: (event.currentTarget as HTMLSelectElement).value as Priority,
		});
	}

	function changeType(event: Event) {
		onfield({
			is_epic: (event.currentTarget as HTMLSelectElement).value === "epic",
		});
	}

	function changeStatus(event: Event) {
		onfield({
			status: (event.currentTarget as HTMLSelectElement).value as Status,
		});
	}

	function changeProject(event: Event) {
		onproject((event.currentTarget as HTMLSelectElement).value);
	}

	function changeEpic(event: Event) {
		const picked = (event.currentTarget as HTMLSelectElement).value;
		onfield({ epic_id: picked === "" ? null : picked });
	}

	function changeScope(event: Event) {
		const picked = (event.currentTarget as HTMLSelectElement).value;
		onfield({ scope_id: picked === "" ? null : Number(picked) });
	}

	function changeTags(event: Event) {
		onfield({
			tags: splitTags((event.currentTarget as HTMLInputElement).value),
		});
	}

	function changeDescription(event: Event) {
		onfield({
			description: (event.currentTarget as HTMLTextAreaElement).value,
		});
	}

	function changeSourceFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const invalid = validateTaskDraft({
			source_file: input.value,
			source_line: value.source_line === null ? "" : String(value.source_line),
		});

		if (invalid !== null) {
			onerror(invalid);
			input.value = value.source_file ?? "";
			return;
		}

		onfield({ source_file: toSourceFile(input.value) });
	}

	function changeSourceLine(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const invalid = validateTaskDraft({
			source_file: value.source_file ?? "",
			source_line: input.value,
		});

		if (invalid !== null) {
			onerror(invalid);
			input.value = value.source_line === null ? "" : String(value.source_line);
			return;
		}

		onfield({ source_line: toSourceLine(input.value) });
	}

	function closedLabel(): string {
		if (value.closed_at == null) return "";
		return `${formatDate(value.closed_at)} ${value.closed_reason ?? ""}`.trim();
	}
</script>

<div class="description">
	<textarea
		class="field-control"
		value={value.description}
		onchange={changeDescription}
		placeholder="Description"
		aria-label="Description"></textarea>
</div>

<div class="detail-grid">
	{#if editing}
		<label class="field">
			Status
			<select
				class="field-control"
				value={value.status}
				onchange={changeStatus}
			>
				{#each STATUSES as option (option)}
					<option value={option}>{STATUS_LABELS[option]}</option>
				{/each}
			</select>
		</label>
	{/if}
	<label class="field">
		Priority
		<select
			class="field-control"
			value={value.priority}
			onchange={changePriority}
		>
			{#each PRIORITIES as option (option)}
				<option value={option}>{option}</option>
			{/each}
		</select>
	</label>
	<label class="field">
		Type
		<select
			class="field-control"
			value={value.is_epic ? "epic" : "task"}
			onchange={changeType}
		>
			<option value="task">task</option>
			<option value="epic">epic</option>
		</select>
	</label>
	{#if editing && value.closed_at != null}
		<label class="field">
			Closed
			<input class="field-control" value={closedLabel()} readOnly />
		</label>
	{/if}
</div>

<div class="detail-grid">
	<label class={`field${scopes.length === 0 ? " wide" : ""}`}>
		Project
		<select
			class="field-control"
			value={value.project_id}
			onchange={changeProject}
			aria-label="Project"
		>
			{#each projects as project (project.id)}
				<option value={project.id}>{project.name}</option>
			{/each}
		</select>
	</label>
	{#if scopes.length > 0}
		<label
			class={`field ${editing && value.scope_id === null ? "scope-missing" : ""}`}
		>
			Scope
			<select
				class="field-control"
				value={value.scope_id === null ? "" : String(value.scope_id)}
				onchange={changeScope}
			>
				<option value="">not selected</option>
				{#each scopes as scope (scope.id)}
					<option value={String(scope.id)}>{scope.name}</option>
				{/each}
			</select>
		</label>
	{/if}
</div>

{#if !value.is_epic}
	<label class="field detail-field">
		Epic
		<select
			class="field-control"
			value={value.epic_id ?? ""}
			onchange={changeEpic}
		>
			<option value="">none</option>
			{#each epics as epic (epic.id)}
				<option value={epic.id}>{epic.id} — {epic.title}</option>
			{/each}
		</select>
	</label>
{/if}

<label class="field detail-field">
	Comma-separated tags
	<input
		class="field-control"
		value={value.tags.join(", ")}
		onchange={changeTags}
	/>
</label>

<div class="detail-grid">
	<label class="field">
		Source file
		<input
			class="field-control"
			value={value.source_file ?? ""}
			onchange={changeSourceFile}
		/>
	</label>
	<label class="field">
		Source line
		<input
			class="field-control"
			value={value.source_line === null ? "" : String(value.source_line)}
			onchange={changeSourceLine}
		/>
	</label>
</div>

<style>
	.description {
		margin: 0 0 var(--space-4);
		color: var(--text-secondary);
		font-size: var(--text-md);
	}

	.wide {
		grid-column: 1 / -1;
	}

	.scope-missing .field-control {
		border-color: color-mix(in oklch, var(--accent) 55%, transparent);
		color: var(--accent-ink);
	}
</style>
