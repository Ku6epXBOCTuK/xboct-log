<script lang="ts">
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import { useTaskEditorSlot } from "#lib/state/task-editor.ts";
	import { toSourceFile, validateTaskDraft } from "#lib/tasks/fields.ts";
	import { ESTIMATES, type Estimate } from "#lib/types.ts";
	import { normalizeDueDate } from "#lib/tasks/display.ts";

	const slot = useTaskEditorSlot();
	const editor = $derived(slot.current);

	const estimateChoices: { key: Estimate | ""; label: string }[] = [
		{ key: "", label: "none" },
		...ESTIMATES.map((estimate) => ({ key: estimate, label: estimate })),
	];

	let estimateChoice = $derived(
		estimateChoices.find(
			(choice) => choice.key === (editor.value.estimate ?? ""),
		) ?? estimateChoices[0],
	);

	function changeSourceFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const invalid = validateTaskDraft({
			source_file: input.value,
		});

		if (invalid !== null) {
			editor.onerror(invalid);
			input.value = editor.value.source_file ?? "";
			return;
		}

		editor.onfield({ source_file: toSourceFile(input.value) });
	}

	function changeAssignee(event: Event) {
		editor.onfield({
			assignee: toSourceFile((event.currentTarget as HTMLInputElement).value),
		});
	}

	function changeDueAt(event: Event) {
		const raw = (event.currentTarget as HTMLInputElement).value;
		const dueAt = normalizeDueDate(raw);
		if (raw.trim() !== "" && dueAt === null) {
			editor.onerror("invalid due date");
			return;
		}
		editor.onfield({ due_at: dueAt });
	}
</script>

<div class="detail-grid">
	<label class="field">
		Due
		<TextInput
			type="date"
			value={editor.value.due_at ?? ""}
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
				editor.onfield({ estimate: choice.key === "" ? null : choice.key })}
			variant="field"
			ariaLabel="Estimate"
		/>
	</div>
	<div class="field">
		Assignee
		<TextInput
			value={editor.value.assignee ?? ""}
			onchange={changeAssignee}
			placeholder="nobody"
		/>
	</div>
	<label class="field">
		Source file
		<TextInput
			value={editor.value.source_file ?? ""}
			onchange={changeSourceFile}
		/>
	</label>
</div>
