<script lang="ts">
	import DescriptionField from "#lib/components/task/DescriptionField.svelte";
	import InfoPopover from "#lib/components/ui/InfoPopover.svelte";
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import { useTaskEditorSlot } from "#lib/state/task-editor.ts";
	import { STATUS_LABELS } from "#lib/tasks/display.ts";
	import {
		BLOCKED_REASON_MAX_LENGTH,
		PRIORITIES,
		STATUSES,
	} from "#lib/types.ts";
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import TagInput from "@ku6epxboctuk/ui-kit/components/TagInput.svelte";
	import CircleHelp from "~icons/lucide/circle-help";
	import Plus from "~icons/lucide/plus";

	interface EpicChoice {
		key: string;
		label: string;
		keywords: string;
	}

	const slot = useTaskEditorSlot();
	const editor = $derived(slot.current);

	const TASK_TYPES: ("task" | "epic")[] = ["task", "epic"];

	let epicChoices = $derived<EpicChoice[]>([
		{ key: "", label: "none", keywords: "" },
		...editor.epics.map((epic) => ({
			key: epic.id,
			label: `${epic.id} — ${epic.title}`,
			keywords: `${epic.id} ${epic.title}`,
		})),
	]);

	let epicChoice = $derived(
		epicChoices.find((choice) => choice.key === (editor.value.epic_id ?? "")) ??
			epicChoices[0],
	);

	function changeBlockedReason(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const reason = input.value.trim();
		editor.onblockedreason?.(reason === "" ? null : reason);
	}
</script>

<div class="detail-grid">
	{#if editor.status !== undefined && editor.onstatus !== undefined}
		<div
			class="field status-field"
			class:is-warn={editor.statusWarn}
			title={editor.statusWarn
				? "a new task does not start in backlog"
				: undefined}
		>
			Status
			<SingleSelect
				items={[...STATUSES]}
				value={editor.status}
				getKey={(item) => item}
				getLabel={(item) => STATUS_LABELS[item]}
				onselect={(item) => editor.onstatus?.(item)}
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
			value={editor.value.priority}
			getKey={(priority) => priority}
			getLabel={(priority) => priority}
			onselect={(priority) => editor.onfield({ priority })}
			variant="field"
			ariaLabel="Priority"
		/>
	</div>
</div>

{#if editor.status === "blocked" && editor.onblockedreason !== undefined}
	<div class="field detail-field">
		Waiting for
		<input
			class="field-control"
			value={editor.blockedReason}
			maxlength={BLOCKED_REASON_MAX_LENGTH}
			onchange={changeBlockedReason}
			placeholder="external blocker: release, answer, access"
			aria-label="Waiting for"
		/>
	</div>
{/if}

<DescriptionField />

<div class="detail-grid">
	<div class="field">
		Type
		<SingleSelect
			items={TASK_TYPES}
			value={editor.value.is_epic ? "epic" : "task"}
			getKey={(type) => type}
			getLabel={(type) => type}
			onselect={(type) => editor.onfield({ is_epic: type === "epic" })}
			variant="field"
			ariaLabel="Type"
		/>
	</div>
	{#if editor.value.is_epic}
		{#if editor.editing && editor.oncreatechild !== undefined}
			<div class="field-action">
				<Button onclick={() => editor.oncreatechild?.()}>
					{#snippet icon()}<Plus />{/snippet}
					Create child task
				</Button>
			</div>
		{/if}
	{:else}
		<div class="field">
			Epic
			<SingleSelect
				items={epicChoices}
				value={epicChoice}
				getKey={(choice) => choice.key}
				getLabel={(choice) => choice.label}
				getKeywords={(choice) => choice.keywords}
				onselect={(choice) =>
					editor.onfield({ epic_id: choice.key === "" ? null : choice.key })}
				variant="field"
				searchable
				searchPlaceholder="Search epics"
				ariaLabel="Epic"
			/>
		</div>
	{/if}
</div>

<div class="field tags-field">
	<span class="field-label">
		Tags
		<InfoPopover label="Tag input shortcuts">
			{#snippet icon()}
				<CircleHelp />
			{/snippet}
			{#snippet content()}
				<dl>
					<dt><code>Enter</code> <code>Space</code></dt>
					<dd>add the highlighted tag</dd>
					<dt><code>,</code></dt>
					<dd>create a tag from the typed text</dd>
					<dt><code>Backspace</code></dt>
					<dd>remove the last tag</dd>
				</dl>
			{/snippet}
		</InfoPopover>
	</span>
	<TagInput
		value={editor.value.tags}
		suggestions={editor.tagPicker.suggestions}
		counts={editor.tagPicker.counts}
		onchange={(tags) => editor.onfield({ tags })}
		onunknown={editor.onunknowntag}
		ariaLabel="Tags"
	/>
</div>

<style>
	.status-field.is-warn :global(.ui-select-trigger) {
		outline: var(--ui-focus-ring-w) solid var(--warning);
		outline-offset: var(--ui-focus-ring-offset);
	}

	.tags-field {
		margin-bottom: var(--space-4);
	}

	.field-action {
		display: flex;
		align-items: flex-end;
		min-width: 0;
	}

	.field-label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2) var(--space-3);
		margin: 0;
	}

	dt {
		color: var(--foreground);
		white-space: nowrap;
	}

	dd {
		margin: 0;
	}

	code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
</style>
