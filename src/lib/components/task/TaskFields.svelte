<script lang="ts">
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import TagInput from "@ku6epxboctuk/ui/ui/TagInput";
	import CopyButton from "#lib/components/ui/CopyButton.svelte";
	import InfoPopover from "#lib/components/ui/InfoPopover.svelte";
	import { CLOSED_REASON_LABELS, formatDate } from "#lib/tasks/display.ts";
	import type { TaskFieldValues, TaskPatch } from "#lib/tasks/fields.ts";
	import type { Task } from "#lib/types.ts";
	import { PRIORITIES } from "#lib/types.ts";
	import Plus from "~icons/lucide/plus";
	import CircleHelp from "~icons/lucide/circle-help";

	interface EpicChoice {
		key: string;
		label: string;
		keywords: string;
	}

	interface Props {
		value: TaskFieldValues;
		epics: Task[];
		tagSuggestions?: string[];
		tagCounts?: Record<string, number>;
		editing?: boolean;
		onfield: (patch: TaskPatch) => void;
		oncreatechild?: () => void;
		commentsCount?: number;
		oncomments?: () => void;
		onunknowntag?: (tag: string) => Promise<unknown>;
	}

	let {
		value,
		epics,
		tagSuggestions = [],
		tagCounts = {},
		editing = false,
		onfield,
		oncreatechild,
		commentsCount,
		oncomments,
		onunknowntag,
	}: Props = $props();

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

	function closedLabel(): string {
		if (value.closed_at == null) return "";
		const reason =
			value.closed_reason == null
				? ""
				: CLOSED_REASON_LABELS[value.closed_reason];
		return `${formatDate(value.closed_at)} ${reason}`.trim();
	}
</script>

<div class="detail-grid">
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

<div class="description detail-field">
	<textarea
		class="field-control"
		value={value.description}
		onchange={changeDescription}
		placeholder="Description"
		aria-label="Description"></textarea>
	<div class="description-actions">
		{#if editing}
			<CopyButton
				text={value.description}
				label="Copy description"
				title="Copy description"
			/>
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

<div class="classify-grid">
	{#if !value.is_epic}
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
	<div class="field" class:classify-full={value.is_epic}>
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
</div>

<style>
	.classify-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.classify-full {
		grid-column: 1 / -1;
	}

	.description {
		color: var(--text-secondary);
		font-size: var(--text-md);
	}

	.description-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.comments-count {
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
