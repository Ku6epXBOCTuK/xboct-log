<script lang="ts">
	import { STATUS_LABELS, formatDate } from "#lib/tasks/display.ts";
	import { PRIORITIES, STATUSES, type Task } from "#lib/types.ts";
	import X from "~icons/lucide/x";
	import StatusDot from "./ui/StatusDot.svelte";

	interface Props {
		selected: Task | null;
	}

	let { selected = $bindable() }: Props = $props();

	function setSelected(task: Task | null) {
		selected = task;
	}
</script>

{#if selected !== null}
	<aside class="detail-panel" aria-label="Task details">
		<div class="detail-top">
			<span class="epic-badge">{selected.id}</span>
			<button
				class="close-detail"
				onclick={() => setSelected(null)}
				aria-label="Close task details"
			>
				<X />
			</button>
		</div>
		<p class="detail-kicker">
			TASK DETAIL / {selected.project_id.toUpperCase()}
		</p>
		<h2>{selected.title}</h2>
		<div class="detail-grid">
			<label>
				Status
				<select value={selected.status}>
					{#each STATUSES as option (option)}
						<option value={option}>{STATUS_LABELS[option]}</option>
					{/each}
				</select>
			</label>
			<label>
				Priority
				<select value={selected.priority}>
					{#each PRIORITIES as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="detail-grid">
			<label>
				Type
				<select value={selected.is_epic ? "epic" : "task"}>
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
		<label class="detail-field">
			Epic
			<input value={selected.epic_id ?? ""} readOnly />
		</label>
		<label class="detail-field">
			Comma-separated tags
			<input value={selected.tags.join(", ")} readOnly />
		</label>
		<div class="progress-meta">
			<StatusDot status={selected.status} />
			<span>{STATUS_LABELS[selected.status]}</span>
			<span class="muted">created {formatDate(selected.created_at)}</span>
			<span class="muted">updated {formatDate(selected.updated_at)}</span>
		</div>
		{#if selected.source_file !== null}
			<code class="source-line">
				{selected.source_file}{selected.source_line === null
					? ""
					: `:${selected.source_line}`}
			</code>
		{/if}
		<div class="description">
			<p>{selected.description}</p>
		</div>
		<button class="edit-button">Edit description</button>
	</aside>
{/if}
