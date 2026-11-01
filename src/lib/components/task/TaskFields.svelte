<script lang="ts">
	import DescriptionField from "#lib/components/task/DescriptionField.svelte";
	import InfoPopover from "#lib/components/ui/InfoPopover.svelte";
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import { STATUS_LABELS } from "#lib/tasks/display.ts";
	import type { TaskFieldValues, TaskPatch } from "#lib/tasks/fields.ts";
	import {
		BLOCKED_REASON_MAX_LENGTH,
		PRIORITIES,
		STATUSES,
		type Status,
		type Task,
	} from "#lib/types.ts";
	import Button from "@ku6epxboctuk/ui-kit/components/Button";
	import TagInput from "@ku6epxboctuk/ui-kit/components/TagInput";
	import CircleHelp from "~icons/lucide/circle-help";
	import Plus from "~icons/lucide/plus";

	interface EpicChoice {
		key: string;
		label: string;
		keywords: string;
	}

	interface Props {
		value: TaskFieldValues;
		epics: Task[];
		taskId?: string;
		repo?: string | null;
		tagSuggestions?: string[];
		tagCounts?: Record<string, number>;
		editing?: boolean;
		status?: Status;
		onstatus?: (status: Status) => void;
		statusWarn?: boolean;
		blockedReason?: string;
		onblockedreason?: (reason: string | null) => void;
		onfield: (patch: TaskPatch) => void;
		ondraft?: (patch: TaskPatch) => void;
		oncanceldraft?: () => void;
		oncreatechild?: () => void;
		commentsCount?: number;
		oncomments?: () => void;
		onunknowntag?: (tag: string) => Promise<unknown>;
	}

	let {
		value,
		epics,
		taskId,
		repo = null,
		tagSuggestions = [],
		tagCounts = {},
		editing = false,
		status,
		onstatus,
		statusWarn = false,
		blockedReason = "",
		onblockedreason,
		onfield,
		ondraft,
		oncanceldraft,
		oncreatechild,
		commentsCount,
		oncomments,
		onunknowntag,
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

	function changeBlockedReason(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const reason = input.value.trim();
		onblockedreason?.(reason === "" ? null : reason);
	}
</script>

<div class="detail-grid">
	{#if status !== undefined && onstatus !== undefined}
		<div
			class="field status-field"
			class:is-warn={statusWarn}
			title={statusWarn ? "a new task does not start in backlog" : undefined}
		>
			Status
			<SingleSelect
				items={[...STATUSES]}
				value={status}
				getKey={(item) => item}
				getLabel={(item) => STATUS_LABELS[item]}
				onselect={(item) => onstatus(item)}
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
</div>

{#if status === "blocked" && onblockedreason !== undefined}
	<div class="field detail-field">
		Waiting for
		<input
			class="field-control"
			value={blockedReason}
			maxlength={BLOCKED_REASON_MAX_LENGTH}
			onchange={changeBlockedReason}
			placeholder="external blocker: release, answer, access"
			aria-label="Waiting for"
		/>
	</div>
{/if}

<DescriptionField
	{value}
	{taskId}
	{repo}
	{editing}
	{commentsCount}
	{oncomments}
	{onfield}
	{ondraft}
	{oncanceldraft}
/>

<div class="detail-grid">
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
	{#if value.is_epic}
		{#if editing && oncreatechild}
			<div class="field-action">
				<Button onclick={oncreatechild}>
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
					onfield({ epic_id: choice.key === "" ? null : choice.key })}
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
		value={value.tags}
		suggestions={tagSuggestions}
		counts={tagCounts}
		onchange={(tags) => onfield({ tags })}
		onunknown={onunknowntag}
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
