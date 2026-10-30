<script lang="ts">
	import MarkdownView from "#lib/components/markdown/MarkdownView.svelte";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
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
	import Eye from "~icons/lucide/eye";
	import EyeOff from "~icons/lucide/eye-off";
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
		tagSuggestions?: string[];
		tagCounts?: Record<string, number>;
		editing?: boolean;
		status?: Status;
		onstatus?: (status: Status) => void;
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
		tagSuggestions = [],
		tagCounts = {},
		editing = false,
		status,
		onstatus,
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

	let area: HTMLTextAreaElement | undefined = $state();
	let preview = $state(false);
	let previewText = $state("");
	let draftText = $state<string | null>(null);
	let draftTask = $state<string | undefined>(undefined);
	let text = $derived(
		draftTask === taskId && draftText !== null ? draftText : value.description,
	);
	let previewTask: string | undefined;
	let dirty = false;

	$effect(() => {
		if (taskId === undefined || taskId === previewTask) return;
		previewTask = taskId;
		preview = false;
		dirty = false;
	});

	function markDirty(event: Event) {
		draftText = (event.currentTarget as HTMLTextAreaElement).value;
		draftTask = taskId;
		dirty = true;
	}

	function commitDescription() {
		if (!dirty) return;
		dirty = false;
		const patch = { description: text };
		if (ondraft !== undefined) {
			ondraft(patch);
			return;
		}
		onfield(patch);
	}

	function togglePreview() {
		if (preview) {
			preview = false;
			return;
		}
		previewText = text;
		preview = true;
	}

	function indent(event: KeyboardEvent) {
		if (event.key !== "Tab" || event.ctrlKey || event.altKey) return;
		const element = area;
		if (element === undefined) return;
		event.preventDefault();

		const start = element.selectionStart;
		const end = element.selectionEnd;
		const source = element.value;

		if (event.shiftKey) {
			const lineStart = source.lastIndexOf("\n", start - 1) + 1;
			const line = source.slice(lineStart, end);
			const trimmed = line.replace(/^ {1,2}/, "");
			const removed = line.length - trimmed.length;
			if (removed === 0) return;
			element.value = source.slice(0, lineStart) + trimmed + source.slice(end);
			element.setSelectionRange(
				Math.max(lineStart, start - removed),
				end - removed,
			);
		} else {
			element.value = `${source.slice(0, start)}  ${source.slice(end)}`;
			element.setSelectionRange(start + 2, start + 2);
		}

		draftText = element.value;
		draftTask = taskId;
		dirty = true;
	}

	function changeBlockedReason(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const reason = input.value.trim();
		onblockedreason?.(reason === "" ? null : reason);
	}
</script>

<div class="detail-grid">
	{#if status !== undefined && onstatus !== undefined}
		<div class="field">
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

<div class="description detail-field">
	<div class="description-box">
		{#if preview}
			<div class="description-preview">
				{#if previewText.trim() === ""}
					<p class="description-empty">Nothing to preview</p>
				{:else}
					<MarkdownView text={previewText} />
				{/if}
			</div>
		{:else}
			<textarea
				class="field-control description-input"
				bind:this={area}
				value={text}
				wrap="off"
				oninput={markDirty}
				onfocus={() => oncanceldraft?.()}
				onblur={commitDescription}
				onkeydown={indent}
				placeholder="Description"
				aria-label="Description"></textarea>
		{/if}
	</div>
	<div class="description-actions">
		<button
			class="description-toggle"
			type="button"
			onclick={togglePreview}
			aria-pressed={preview}
		>
			{#if preview}
				<EyeOff />
				Edit
			{:else}
				<Eye />
				Preview
			{/if}
		</button>
		{#if editing}
			<CopyButton {text} label="Copy description" title="Copy description" />
		{/if}
		{#if commentsCount !== undefined}
			<button
				class="comments-count"
				type="button"
				onclick={() => oncomments?.()}
				disabled={oncomments === undefined}
			>
				{commentsCount}
				{commentsCount === 1 ? "comment" : "comments"}
			</button>
		{/if}
	</div>
</div>

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
	.tags-field {
		margin-bottom: var(--space-4);
	}

	.description {
		color: var(--text-secondary);
		font-size: var(--text-md);
	}

	.description-box {
		height: 20rem;
		min-height: 6rem;
		resize: vertical;
		overflow: hidden;
	}

	.description-box textarea {
		height: 100%;
		min-height: 0;
		resize: none;
		white-space: pre;
		overflow-wrap: normal;
	}

	.description-input {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.description-preview {
		height: 100%;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--field);
		padding: var(--space-3);
		overflow: auto;
	}

	.description-empty {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.description-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.description-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		min-height: 1.5rem;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.description-toggle:hover {
		border-color: var(--border-strong);
		color: var(--foreground);
	}

	.description-toggle[aria-pressed="true"] {
		background: var(--selected);
		color: var(--foreground);
	}

	.description-toggle :global(svg) {
		width: 0.9rem;
		height: 0.9rem;
	}

	.comments-count {
		margin-left: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		min-height: 1.5rem;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.comments-count:hover:not(:disabled) {
		border-color: var(--border-strong);
		color: var(--foreground);
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
