<script lang="ts">
	import Select from "#lib/components/ui/select/Select.svelte";
	import { createSelect } from "#lib/components/ui/select/select.svelte.ts";
	import X from "~icons/lucide/x";

	interface Props {
		value: string[];
		suggestions?: string[];
		counts?: Record<string, number>;
		onchange: (tags: string[]) => void;
		placeholder?: string;
		ariaLabel?: string;
		variant?: "filter" | "field";
		class?: string;
	}

	let {
		value,
		suggestions = [],
		counts = {},
		onchange,
		placeholder = "Add tags",
		ariaLabel = "Tags",
		variant = "field",
		class: className = "",
	}: Props = $props();

	const select = createSelect<string>({
		items: () => suggestions.filter((tag) => !value.includes(tag)),
		getLabel: (tag) => tag,
		closeOnPick: false,
		onPick: (tag) => add([tag]),
	});

	let text = $state("");
	let input = $state<HTMLInputElement | null>(null);

	const uid = $props.id();
	const listId = `${uid}-list`;

	function add(candidates: string[]) {
		const fresh = candidates.filter(
			(tag) => tag !== "" && !value.includes(tag),
		);
		if (fresh.length > 0) onchange([...value, ...fresh]);
		text = "";
		select.setQuery("");
	}

	function commit() {
		add(text.split(/[\s,]+/));
	}

	function remove(tag: string) {
		onchange(value.filter((item) => item !== tag));
	}

	function focusInput() {
		input?.focus();
		select.show();
	}

	function onkeydown(event: KeyboardEvent): boolean {
		if (event.key === ",") {
			commit();
			return true;
		}
		if (event.key === " " || event.key === "Enter") {
			if (text.trim() === "") return event.key === " ";
			const active = select.active;
			if (active !== null) select.pickActive();
			else commit();
			return true;
		}
		if (event.key === "Backspace" && text === "" && value.length > 0) {
			onchange(value.slice(0, -1));
			return true;
		}
		return false;
	}
</script>

{#snippet trigger()}
	<div
		class="select-trigger tag-trigger"
		role="presentation"
		onpointerdown={(event) => {
			if (event.target !== input) {
				event.preventDefault();
				focusInput();
			}
		}}
	>
		{#each value as tag (tag)}
			<span class="tag-chip">
				{tag}
				<button
					type="button"
					class="tag-chip-remove"
					aria-label={`Remove ${tag}`}
					onclick={() => remove(tag)}
				>
					<X />
				</button>
			</span>
		{/each}
		<input
			class="tag-input"
			bind:this={input}
			value={text}
			oninput={(event) => {
				text = event.currentTarget.value;
				if (!select.open) select.show();
				select.setQuery(text);
			}}
			onfocus={() => select.show()}
			{placeholder}
			aria-label={ariaLabel}
			role="combobox"
			aria-expanded={select.open}
			aria-controls={select.open ? listId : undefined}
			aria-autocomplete="list"
			autocomplete="off"
		/>
	</div>
{/snippet}

{#snippet option(tag: string)}
	<span class="select-option-label">{tag}</span>
	{#if counts[tag] !== undefined}
		<span class="select-option-count">{counts[tag]}</span>
	{/if}
{/snippet}

<Select
	{select}
	getKey={(tag) => tag}
	{trigger}
	{option}
	{onkeydown}
	{variant}
	class={className}
	multiselect
	listLabel={ariaLabel}
	{listId}
	emptyLabel={text.trim() === "" ? "No tags yet" : `Add "${text.trim()}"`}
/>

<style>
	.tag-trigger {
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-2);
		padding: var(--space-1) var(--space-2);
		cursor: text;
	}

	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0 var(--space-1) 0 var(--space-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--panel);
		color: var(--text-secondary);
		font-size: var(--text-xs);
		line-height: 1.75;
	}

	.tag-chip-remove {
		display: inline-flex;
		align-items: center;
		color: var(--text-muted);
	}

	.tag-chip-remove:hover {
		color: var(--foreground);
	}

	.tag-chip-remove :global(svg) {
		width: 0.75rem;
		height: 0.75rem;
	}

	.tag-input {
		flex: 1 1 5rem;
		min-width: 5rem;
		min-height: var(--control-h-sm);
		margin: 0;
		padding: 0 var(--space-1);
		border: 0;
		border-radius: 0;
		appearance: none;
		background: transparent;
		color: var(--foreground);
		font-size: var(--text-sm);
		outline: none;
	}

	.tag-input::placeholder {
		color: var(--text-muted);
	}
</style>
