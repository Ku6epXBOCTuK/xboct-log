<script lang="ts">
	import type { Snippet } from "svelte";
	import MarkdownView from "#lib/components/markdown/MarkdownView.svelte";
	import { appendMarkdown, markdownDrop } from "#lib/files/markdown-drop.ts";
	import { matchesHotkey } from "#lib/hotkeys/hotkeys.ts";
	import { indentSelection } from "#lib/markdown/editing.ts";
	import Eye from "~icons/lucide/eye";
	import EyeOff from "~icons/lucide/eye-off";
	import WrapText from "~icons/lucide/wrap-text";

	interface Props {
		value: string;
		label: string;
		placeholder?: string;
		repo?: string | null;
		target?: string;
		height?: string;
		resizable?: boolean;
		rows?: number;
		actions?: Snippet;
		oninput?: (value: string) => void;
		oninsert?: (value: string) => void;
		onfocus?: () => void;
		onblur?: () => void;
	}

	let {
		value = $bindable(""),
		label,
		placeholder = "",
		repo = null,
		target,
		height = "10rem",
		resizable = false,
		rows = 3,
		actions,
		oninput,
		oninsert,
		onfocus,
		onblur,
	}: Props = $props();

	let area: HTMLTextAreaElement | undefined = $state();
	let preview = $state(false);
	let previewText = $state("");
	let wrap = $state(true);
	let shownTarget: string | undefined;

	$effect(() => {
		if (target === undefined || target === shownTarget) return;
		shownTarget = target;
		preview = false;
	});

	function change(event: Event) {
		value = (event.currentTarget as HTMLTextAreaElement).value;
		oninput?.(value);
	}

	function takeMarkdown(markdown: string) {
		const next = appendMarkdown(value, markdown);
		if (next === value) return;
		value = next;
		preview = false;
		oninsert?.(next);
	}

	function togglePreview() {
		if (preview) {
			preview = false;
			return;
		}
		previewText = value;
		preview = true;
	}

	function toggleWrap() {
		wrap = !wrap;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (matchesHotkey(event, "alt+z")) {
			event.preventDefault();
			toggleWrap();
			return;
		}
		if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey) {
			return;
		}

		const element = area;
		if (element === undefined) return;
		event.preventDefault();

		const edit = indentSelection(
			element.value,
			element.selectionStart,
			element.selectionEnd,
			event.shiftKey,
		);
		if (edit === null) return;

		value = edit.value;
		element.value = edit.value;
		element.setSelectionRange(edit.start, edit.end);
		oninput?.(edit.value);
	}
</script>

<div class="md-editor">
	<div
		class="md-box"
		style:height
		style:resize={resizable ? "vertical" : undefined}
		use:markdownDrop={{ ontext: takeMarkdown }}
	>
		{#if preview}
			<div class="md-preview">
				{#if previewText.trim() === ""}
					<p class="md-empty">Nothing to preview</p>
				{:else}
					<MarkdownView text={previewText} {repo} />
				{/if}
			</div>
		{:else}
			<textarea
				class="field-control md-input"
				bind:this={area}
				{value}
				{rows}
				wrap={wrap ? "soft" : "off"}
				style:white-space={wrap ? "pre-wrap" : "pre"}
				style:overflow-wrap={wrap ? "anywhere" : "normal"}
				oninput={change}
				onfocus={() => onfocus?.()}
				onblur={() => onblur?.()}
				onkeydown={handleKeydown}
				{placeholder}
				aria-label={label}></textarea>
		{/if}
	</div>
	<div class="md-actions">
		<button
			class="md-toggle"
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
		{#if !preview}
			<button
				class="md-toggle"
				type="button"
				onclick={toggleWrap}
				aria-pressed={wrap}
				aria-label="Wrap long lines"
				title="Wrap long lines (Alt+Z)"
			>
				<WrapText />
				Wrap
			</button>
		{/if}
		{@render actions?.()}
	</div>
</div>

<style>
	.md-editor {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.md-box {
		min-height: 6rem;
		overflow: hidden;
	}

	.md-box textarea {
		height: 100%;
		min-height: 0;
		resize: none;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}

	.md-preview {
		height: 100%;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--field);
		padding: var(--space-3);
		overflow: auto;
	}

	.md-empty {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.md-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.md-toggle {
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

	.md-toggle:hover {
		border-color: var(--border-strong);
		color: var(--foreground);
	}

	.md-toggle[aria-pressed="true"] {
		background: var(--selected);
		color: var(--foreground);
	}

	.md-toggle :global(svg) {
		width: 0.9rem;
		height: 0.9rem;
	}
</style>
