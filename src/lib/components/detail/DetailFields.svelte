<script lang="ts">
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { STATUS_LABELS, formatDate } from "#lib/tasks/display.ts";
	import { siblingEpics } from "#lib/tasks/fields.ts";
	import type { Priority, Project, Scope, Status, Task } from "#lib/types.ts";
	import { PRIORITIES, STATUSES } from "#lib/types.ts";

	interface Props {
		task: Task;
		projects: Project[];
		epics: Task[];
		scopes: Scope[];
		saving: boolean;
		onstatus: (status: Status) => void;
		onpriority: (priority: Priority) => void;
		ontype: (isEpic: boolean) => void;
		onproject: (event: Event) => void;
		onepic: (epicId: string | null) => void;
		onscope: (scopeId: number | null) => void;
		ontags: (event: Event) => void;
		onsourcefile: (event: Event) => void;
		onsourceline: (event: Event) => void;
		ondescription: (event: Event) => void;
	}

	let {
		task,
		projects,
		epics,
		scopes,
		saving,
		onstatus,
		onpriority,
		ontype,
		onproject,
		onepic,
		onscope,
		ontags,
		onsourcefile,
		onsourceline,
		ondescription,
	}: Props = $props();

	const epicOptions = $derived(siblingEpics(epics, task));
</script>

<div class="detail-grid">
	<label class="field">
		Status
		<select
			class="field-control"
			value={task.status}
			onchange={(event) => onstatus(event.currentTarget.value as Status)}
		>
			{#each STATUSES as option (option)}
				<option value={option}>{STATUS_LABELS[option]}</option>
			{/each}
		</select>
	</label>
	<label class="field">
		Priority
		<select
			class="field-control"
			value={task.priority}
			onchange={(event) => onpriority(event.currentTarget.value as Priority)}
		>
			{#each PRIORITIES as option (option)}
				<option value={option}>{option}</option>
			{/each}
		</select>
	</label>
</div>
<div class="detail-grid">
	<label class="field">
		Type
		<select
			class="field-control"
			value={task.is_epic ? "epic" : "task"}
			onchange={(event) => ontype(event.currentTarget.value === "epic")}
		>
			<option value="task">task</option>
			<option value="epic">epic</option>
		</select>
	</label>
	<label class="field">
		Closed
		<input
			class="field-control"
			value={task.closed_at === null ? "" : formatDate(task.closed_at)}
			readOnly
		/>
	</label>
</div>
{#if task.closed_at !== null}
	<label class="field detail-field">
		Closed reason
		<input class="field-control" value={task.closed_reason ?? ""} readOnly />
	</label>
{/if}
<label class="field detail-field">
	Project
	<select
		class="field-control"
		value={task.project_id}
		onchange={onproject}
		aria-label="Project"
	>
		{#each projects as project (project.id)}
			<option value={project.id}>{project.name}</option>
		{/each}
	</select>
</label>
<label class="field detail-field">
	Epic
	<select
		class="field-control"
		value={task.epic_id ?? ""}
		onchange={(event) =>
			onepic(
				event.currentTarget.value === "" ? null : event.currentTarget.value,
			)}
	>
		<option value="">none</option>
		{#each epicOptions as epic (epic.id)}
			<option value={epic.id}>{epic.id} — {epic.title}</option>
		{/each}
	</select>
</label>
{#if scopes.length > 0}
	<label
		class={`field detail-field ${task.scope_id === null ? "scope-missing" : ""}`}
	>
		Scope
		<select
			class="field-control"
			value={task.scope_id === null ? "" : String(task.scope_id)}
			onchange={(event) =>
				onscope(
					event.currentTarget.value === ""
						? null
						: Number(event.currentTarget.value),
				)}
		>
			<option value="">not selected</option>
			{#each scopes as scope (scope.id)}
				<option value={String(scope.id)}>{scope.name}</option>
			{/each}
		</select>
	</label>
{/if}
<label class="field detail-field">
	Comma-separated tags
	<input class="field-control" value={task.tags.join(", ")} onchange={ontags} />
</label>
<div class="detail-grid">
	<label class="field">
		Source file
		<input
			class="field-control"
			value={task.source_file ?? ""}
			onchange={onsourcefile}
		/>
	</label>
	<label class="field">
		Source line
		<input
			class="field-control"
			value={task.source_line === null ? "" : String(task.source_line)}
			onchange={onsourceline}
		/>
	</label>
</div>
<div class="progress-meta">
	<StatusDot status={task.status} />
	<span>{STATUS_LABELS[task.status]}</span>
	<span class="muted">
		{saving ? "saving…" : `updated ${formatDate(task.updated_at)}`}
	</span>
</div>
<div class="description">
	<textarea
		class="field-control"
		value={task.description}
		onchange={ondescription}
		placeholder="Description"
		aria-label="Description"></textarea>
</div>

<style>
	.progress-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: var(--space-5) 0 var(--space-3);
		color: var(--text-secondary);
		font-size: var(--text-xs);
	}

	.muted {
		color: var(--text-muted);
		margin-left: auto;
		font-variant-numeric: tabular-nums;
	}

	.description {
		margin: 0 0 var(--space-4);
		color: var(--text-secondary);
		font-size: var(--text-md);
	}

	.scope-missing .field-control {
		border-color: color-mix(in oklch, var(--accent) 55%, transparent);
		color: var(--accent-ink);
	}
</style>
