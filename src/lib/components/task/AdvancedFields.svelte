<script lang="ts">
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import {
		toSourceFile,
		validateTaskDraft,
		type TaskFieldValues,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import { ESTIMATES, type Estimate } from "#lib/types.ts";
	import { normalizeDueDate } from "#lib/tasks/display.ts";

	interface Props {
		value: TaskFieldValues;
		onfield: (patch: TaskPatch) => void;
		onerror: (message: string) => void;
	}

	let { value, onfield, onerror }: Props = $props();

	const TASK_TYPES: ("task" | "epic")[] = ["task", "epic"];

	const estimateChoices: { key: Estimate | ""; label: string }[] = [
		{ key: "", label: "none" },
		...ESTIMATES.map((estimate) => ({ key: estimate, label: estimate })),
	];

	let estimateChoice = $derived(
		estimateChoices.find((choice) => choice.key === (value.estimate ?? "")) ??
			estimateChoices[0],
	);

	function changeSourceFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const invalid = validateTaskDraft({
			source_file: input.value,
		});

		if (invalid !== null) {
			onerror(invalid);
			input.value = value.source_file ?? "";
			return;
		}

		onfield({ source_file: toSourceFile(input.value) });
	}

	function changeAssignee(event: Event) {
		onfield({
			assignee: toSourceFile((event.currentTarget as HTMLInputElement).value),
		});
	}

	function changeDueAt(event: Event) {
		const raw = (event.currentTarget as HTMLInputElement).value;
		const dueAt = normalizeDueDate(raw);
		if (raw.trim() !== "" && dueAt === null) {
			onerror("invalid due date");
			return;
		}
		onfield({ due_at: dueAt });
	}
</script>

<div class="detail-grid">
	<label class="field">
		Due
		<input
			class="field-control"
			type="date"
			value={value.due_at ?? ""}
			onchange={changeDueAt}
		/>
	</label>
	<div class="field">
		Estimate
		<SingleSelect
			items={estimateChoices}
			value={estimateChoice}
			getKey={(choice) => choice.key}
			getLabel={(choice) => choice.label}
			onselect={(choice) =>
				onfield({ estimate: choice.key === "" ? null : choice.key })}
			variant="field"
			ariaLabel="Estimate"
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
	<label class="field">
		Assignee
		<input
			class="field-control"
			value={value.assignee ?? ""}
			onchange={changeAssignee}
			placeholder="nobody"
		/>
	</label>
	<label class="field">
		Source file
		<input
			class="field-control"
			value={value.source_file ?? ""}
			onchange={changeSourceFile}
		/>
	</label>
</div>
