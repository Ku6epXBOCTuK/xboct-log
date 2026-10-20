<script lang="ts">
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import TagInput from "#lib/components/ui/select/TagInput.svelte";
	import { STATUS_LABELS, formatDate } from "#lib/tasks/display.ts";
	import {
		toSourceFile,
		toSourceLine,
		validateTaskDraft,
		type TaskFieldValues,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import type { Task } from "#lib/types.ts";
	import { PRIORITIES, STATUSES } from "#lib/types.ts";
	import Plus from "~icons/lucide/plus";

	interface EpicChoice {
		key: string;
		label: string;
		keywords: string;
	}

	interface Props {
		value: TaskFieldValues;
		epics: Task[];
		tagSuggestions?: string[];
		editing?: boolean;
		onfield: (patch: TaskPatch) => void;
		onerror: (message: string) => void;
		oncreatechild?: () => void;
	}

	let {
		value,
		epics,
		tagSuggestions = [],
		editing = false,
		onfield,
		onerror,
		oncreatechild,
	}: Props = $props();

	const TASK_TYPES: ("task" | "epic")[] = ["task", "epic"];

	let epicChoices = $derived<EpicChoice[]>([
		{ key: "", label: "none", keywords: "" },
		...epics.map((epic) => ({
			key: epic.id,
			label: `${epic.id} — ${epic.title}`,
			keywords: `${epic.id} ${epic.title}`,
		})),
	]);

	let epicChoice = $derived(
		epicChoices.find((choice) => choice.key === (value.epic_id ?? "")) ??
			epicChoices[0],
	);

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
		<div class="field">
			Status
			<SingleSelect
				items={[...STATUSES]}
				value={value.status ?? null}
				getKey={(status) => status}
				getLabel={(status) => STATUS_LABELS[status]}
				onselect={(status) => onfield({ status })}
				variant="field"
				ariaLabel="Status"
				placeholder="Status"
			/>
		</div>
	{/if}
	<div class="field">
		Priority
		<SingleSelect
			items={[...PRIORITIES].reverse()}
			value={value.priority}
			getKey={(priority) => priority}
			getLabel={(priority) => priority}
			onselect={(priority) => onfield({ priority })}
			variant="field"
			ariaLabel="Priority"
		/>
	</div>
	<div class="field">
		Type
		<SingleSelect
			items={TASK_TYPES}
			value={value.is_epic ? "epic" : "task"}
			getKey={(type) => type}
			getLabel={(type) => type}
			onselect={(type) => onfield({ is_epic: type === "epic" })}
			variant="field"
			ariaLabel="Type"
		/>
	</div>
	{#if editing && value.is_epic && oncreatechild}
		<div class="field-action">
			<button class="icon-button" onclick={oncreatechild}>
				<Plus data-icon="inline-start" /> Create child task
			</button>
		</div>
	{/if}
	{#if editing && value.closed_at != null}
		<label class="field">
			Closed
			<input class="field-control" value={closedLabel()} readOnly />
		</label>
	{/if}
</div>

{#if !value.is_epic}
	<div class="field detail-field">
		Epic
		<SingleSelect
			items={epicChoices}
			value={epicChoice}
			getKey={(choice) => choice.key}
			getLabel={(choice) => choice.label}
			getKeywords={(choice) => choice.keywords}
			onselect={(choice) =>
				onfield({ epic_id: choice.key === "" ? null : choice.key })}
			variant="field"
			searchable
			searchPlaceholder="Search epics"
			ariaLabel="Epic"
		/>
	</div>
{/if}

<div class="field detail-field">
	Tags
	<TagInput
		value={value.tags}
		suggestions={tagSuggestions}
		onchange={(tags) => onfield({ tags })}
		ariaLabel="Tags"
	/>
</div>

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

	.field-action {
		display: flex;
		align-items: flex-end;
		min-width: 0;
	}
</style>
