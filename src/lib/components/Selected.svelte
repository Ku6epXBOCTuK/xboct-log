<script lang="ts">
	import {
		closeTask,
		deleteTask,
		moveTask,
		updateTask,
	} from "#lib/remote/tasks.remote.ts";
	import { STATUS_LABELS, formatDate, messageOf } from "#lib/tasks/display.ts";
	import {
		CLOSED_REASONS,
		PRIORITIES,
		STATUSES,
		STATUS_BY_REASON,
		type ClosedReason,
		type Priority,
		type Project,
		type Status,
		type Task,
	} from "#lib/types.ts";
	import X from "~icons/lucide/x";
	import StatusDot from "./ui/StatusDot.svelte";

	type Patch = Partial<
		Pick<
			Task,
			| "title"
			| "description"
			| "status"
			| "priority"
			| "is_epic"
			| "epic_id"
			| "source_file"
			| "source_line"
			| "tags"
		>
	>;

	interface Props {
		selected: Task | null;
		epics: Task[];
		projects: Project[];
		onchange?: (task: Task) => void;
		onmove?: (oldId: string, task: Task) => void;
		ondelete?: (id: string) => void;
	}

	let {
		selected = $bindable(),
		epics,
		projects,
		onchange,
		onmove,
		ondelete,
	}: Props = $props();

	let saving = $state(false);
	let failure = $state<string | null>(null);
	let closeReason = $state<ClosedReason>("fixed");
	let confirmingDelete = $state(false);

	const epicOptions = $derived(
		selected === null
			? []
			: epics.filter(
					(epic) =>
						epic.id !== selected?.id &&
						epic.project_id === selected?.project_id,
				),
	);

	async function save(patch: Patch) {
		if (selected === null) return;

		const id = selected.id;
		saving = true;
		failure = null;

		try {
			const updated = await updateTask({ id, patch });
			if (selected?.id === id) selected = updated;
			onchange?.(updated);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}

	function saveTitle(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const title = input.value.trim();

		if (title === "") {
			failure = "title cannot be empty";
			input.value = selected?.title ?? "";
			return;
		}

		save({ title });
	}

	function saveSourceFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).value.trim();
		save({ source_file: file === "" ? null : file });
	}

	function saveSourceLine(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const raw = input.value.trim();
		const line = raw === "" ? null : Number(raw);

		if (line !== null && !Number.isInteger(line)) {
			failure = "source line must be a whole number";
			input.value =
				selected?.source_line === null || selected?.source_line === undefined
					? ""
					: String(selected.source_line);
			return;
		}

		save({ source_line: line });
	}

	function saveTags(event: Event) {
		const tags = (event.currentTarget as HTMLInputElement).value
			.split(",")
			.map((tag) => tag.trim())
			.filter((tag) => tag !== "");

		save({ tags });
	}

	function saveDescription(event: Event) {
		save({ description: (event.currentTarget as HTMLTextAreaElement).value });
	}

	async function moveTo(event: Event) {
		if (selected === null) return;

		const projectId = (event.currentTarget as HTMLSelectElement).value;
		if (projectId === selected.project_id) return;

		const oldId = selected.id;
		saving = true;
		failure = null;

		try {
			const moved = await moveTask({ id: oldId, project_id: projectId });
			if (selected?.id === oldId) selected = moved;
			onmove?.(oldId, moved);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}

	async function closeSelected() {
		if (selected === null) return;

		const id = selected.id;
		saving = true;
		failure = null;

		try {
			const updated = await closeTask({ id, reason: closeReason });
			if (selected?.id === id) selected = updated;
			onchange?.(updated);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}

	async function deleteSelected() {
		if (selected === null) return;

		const id = selected.id;
		saving = true;
		failure = null;

		try {
			await deleteTask(id);
			confirmingDelete = false;
			selected = null;
			ondelete?.(id);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}

	function reopen() {
		save({ status: "open" });
	}
</script>

{#if selected !== null}
	<aside class="detail-panel" aria-label="Task details">
		<div class="detail-top">
			<span class="epic-badge">{selected.id}</span>
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
		{#if failure !== null}
			<p class="detail-error">{failure}</p>
		{/if}
		<div class="detail-grid">
			<label>
				Status
				<select
					value={selected.status}
					onchange={(event) =>
						save({ status: event.currentTarget.value as Status })}
				>
					{#each STATUSES as option (option)}
						<option value={option}>{STATUS_LABELS[option]}</option>
					{/each}
				</select>
			</label>
			<label>
				Priority
				<select
					value={selected.priority}
					onchange={(event) =>
						save({ priority: event.currentTarget.value as Priority })}
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
					value={selected.is_epic ? "epic" : "task"}
					onchange={(event) =>
						save({ is_epic: event.currentTarget.value === "epic" })}
				>
					<option value="task">task</option>
					<option value="epic">epic</option>
				</select>
			</label>
			<label>
				Closed
				<input
					value={selected.closed_at === null
						? ""
						: formatDate(selected.closed_at)}
					readOnly
				/>
			</label>
		</div>
		{#if selected.closed_at !== null}
			<label class="detail-field">
				Closed reason
				<input value={selected.closed_reason ?? ""} readOnly />
			</label>
		{/if}
		<label class="detail-field">
			Project
			<select
				value={selected.project_id}
				onchange={moveTo}
				aria-label="Project"
			>
				{#each projects as project (project.id)}
					<option value={project.id}>{project.name}</option>
				{/each}
			</select>
		</label>
		<label class="detail-field">
			Epic
			<select
				value={selected.epic_id ?? ""}
				onchange={(event) =>
					save({
						epic_id:
							event.currentTarget.value === ""
								? null
								: event.currentTarget.value,
					})}
			>
				<option value="">none</option>
				{#each epicOptions as epic (epic.id)}
					<option value={epic.id}>{epic.id} — {epic.title}</option>
				{/each}
			</select>
		</label>
		<label class="detail-field">
			Comma-separated tags
			<input value={selected.tags.join(", ")} onchange={saveTags} />
		</label>
		<div class="detail-grid">
			<label>
				Source file
				<input value={selected.source_file ?? ""} onchange={saveSourceFile} />
			</label>
			<label>
				Source line
				<input
					value={selected.source_line === null
						? ""
						: String(selected.source_line)}
					onchange={saveSourceLine}
				/>
			</label>
		</div>
		<div class="progress-meta">
			<StatusDot status={selected.status} />
			<span>{STATUS_LABELS[selected.status]}</span>
			<span class="muted">
				{saving ? "saving…" : `updated ${formatDate(selected.updated_at)}`}
			</span>
		</div>
		<div class="description">
			<textarea
				value={selected.description}
				onchange={saveDescription}
				placeholder="Description"
				aria-label="Description"></textarea>
		</div>
		<div class="detail-actions">
			<div class="action-group">
				{#if selected.closed_at === null}
					<label class="close-reason">
						Close reason
						<select bind:value={closeReason} aria-label="Close reason">
							{#each CLOSED_REASONS as option (option)}
								<option value={option}>
									{option} → {STATUS_BY_REASON[option]}
								</option>
							{/each}
						</select>
					</label>
					<button class="new-task" onclick={closeSelected} disabled={saving}>
						Close
					</button>
				{:else}
					<button class="icon-button" onclick={reopen} disabled={saving}>
						Reopen
					</button>
				{/if}
			</div>
			<div class="action-group">
				{#if confirmingDelete}
					<button
						class="icon-button"
						onclick={() => (confirmingDelete = false)}
					>
						Cancel
					</button>
					<button
						class="danger armed"
						onclick={deleteSelected}
						disabled={saving}
					>
						Confirm delete
					</button>
				{:else}
					<button class="danger" onclick={() => (confirmingDelete = true)}>
						Delete
					</button>
				{/if}
			</div>
		</div>
	</aside>
{/if}
