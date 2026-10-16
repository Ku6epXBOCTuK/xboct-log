<script lang="ts">
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { STATUS_LABELS, formatDate } from "#lib/tasks/display.ts";
	import { siblingEpics } from "#lib/tasks/fields.ts";
	import type { Priority, Project, Status, Task } from "#lib/types.ts";
	import { PRIORITIES, STATUSES } from "#lib/types.ts";

	interface Props {
		task: Task;
		projects: Project[];
		epics: Task[];
		saving: boolean;
		onstatus: (status: Status) => void;
		onpriority: (priority: Priority) => void;
		ontype: (isEpic: boolean) => void;
		onproject: (event: Event) => void;
		onepic: (epicId: string | null) => void;
		ontags: (event: Event) => void;
		onsourcefile: (event: Event) => void;
		onsourceline: (event: Event) => void;
		ondescription: (event: Event) => void;
	}

	let {
		task,
		projects,
		epics,
		saving,
		onstatus,
		onpriority,
		ontype,
		onproject,
		onepic,
		ontags,
		onsourcefile,
		onsourceline,
		ondescription,
	}: Props = $props();

	const epicOptions = $derived(siblingEpics(epics, task));
</script>

<div class="detail-grid">
	<label>
		Status
		<select
			value={task.status}
			onchange={(event) => onstatus(event.currentTarget.value as Status)}
		>
			{#each STATUSES as option (option)}
				<option value={option}>{STATUS_LABELS[option]}</option>
			{/each}
		</select>
	</label>
	<label>
		Priority
		<select
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
	<label>
		Type
		<select
			value={task.is_epic ? "epic" : "task"}
			onchange={(event) => ontype(event.currentTarget.value === "epic")}
		>
			<option value="task">task</option>
			<option value="epic">epic</option>
		</select>
	</label>
	<label>
		Closed
		<input
			value={task.closed_at === null ? "" : formatDate(task.closed_at)}
			readOnly
		/>
	</label>
</div>
{#if task.closed_at !== null}
	<label class="detail-field">
		Closed reason
		<input value={task.closed_reason ?? ""} readOnly />
	</label>
{/if}
<label class="detail-field">
	Project
	<select value={task.project_id} onchange={onproject} aria-label="Project">
		{#each projects as project (project.id)}
			<option value={project.id}>{project.name}</option>
		{/each}
	</select>
</label>
<label class="detail-field">
	Epic
	<select
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
<label class="detail-field">
	Comma-separated tags
	<input value={task.tags.join(", ")} onchange={ontags} />
</label>
<div class="detail-grid">
	<label>
		Source file
		<input value={task.source_file ?? ""} onchange={onsourcefile} />
	</label>
	<label>
		Source line
		<input
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
		value={task.description}
		onchange={ondescription}
		placeholder="Description"
		aria-label="Description"></textarea>
</div>
