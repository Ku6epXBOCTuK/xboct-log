<script lang="ts">
	import Select from "#lib/components/ui/select/Select.svelte";
	import { createSelect } from "#lib/components/ui/select/select.svelte.ts";
	import type { Task } from "#lib/types.ts";
	import Plus from "~icons/lucide/plus";
	import X from "~icons/lucide/x";

	interface Props {
		items: Task[];
		value: string[];
		onadd: (id: string) => void;
		onremove: (id: string) => void;
		onopen?: (id: string) => void;
		unavailable?: (id: string) => string | null;
		placeholder?: string;
		ariaLabel?: string;
		variant?: "filter" | "field";
		class?: string;
	}

	let {
		items,
		value,
		onadd,
		onremove,
		onopen,
		unavailable,
		placeholder = "Add task",
		ariaLabel = "Tasks",
		variant = "field",
		class: className = "",
	}: Props = $props();

	function label(task: Task): string {
		return `${task.id} — ${task.title}`;
	}

	const select = createSelect<Task>({
		items: () => items.filter((task) => !value.includes(task.id)),
		getLabel: (task) => label(task),
		getKeywords: (task) => `${task.id} ${task.title}`,
		closeOnPick: false,
		onPick: (task) => {
			onadd(task.id);
			select.setQuery("");
		},
	});

	const uid = $props.id();
	const listId = `${uid}-list`;

	const isSelected = (task: Task) => value.includes(task.id);
</script>

{#snippet trigger()}
	<div class="select-trigger task-trigger" role="presentation">
		{#each value as id (id)}
			{@const hint = unavailable?.(id) ?? null}
			<span class="task-chip" class:is-unavailable={hint !== null}>
				{#if onopen && hint === null}
					<button
						type="button"
						class="task-chip-open"
						aria-label={`Open ${id}`}
						onclick={() => onopen(id)}
					>
						{id}
					</button>
				{:else}
					<span title={hint ?? undefined} aria-disabled={hint !== null}>
						{id}
					</span>
				{/if}
				<button
					type="button"
					class="task-chip-remove"
					aria-label={`Remove ${id}`}
					onclick={() => onremove(id)}
				>
					<X />
				</button>
			</span>
		{/each}
		<button
			type="button"
			class="task-add"
			aria-label={placeholder}
			onclick={() => select.toggle()}
		>
			<Plus />
		</button>
	</div>
{/snippet}

{#snippet option(task: Task)}
	<span class="select-option-label">{label(task)}</span>
{/snippet}

<Select
	{select}
	getKey={(task) => task.id}
	{trigger}
	{option}
	{isSelected}
	searchable
	searchPlaceholder="Search tasks"
	{variant}
	class={className}
	multiselect
	listLabel={ariaLabel}
	{listId}
	emptyLabel="No tasks left"
/>

<style>
	.task-trigger {
		flex-wrap: wrap;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		cursor: default;
	}

	.task-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0 var(--space-1) 0 var(--space-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--panel);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		line-height: 1.75;
	}

	.task-chip.is-unavailable {
		border-style: dashed;
		color: var(--text-muted);
	}

	.task-chip.is-unavailable [aria-disabled="true"] {
		cursor: not-allowed;
	}

	.task-chip-open {
		border: 0;
		padding: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.task-chip-open:hover {
		color: var(--foreground);
		text-decoration: underline;
	}

	.task-chip-remove {
		display: inline-flex;
		color: var(--text-muted);
	}

	.task-chip-remove:hover {
		color: var(--foreground);
	}

	.task-chip-remove :global(svg) {
		width: 0.75rem;
		height: 0.75rem;
	}

	.task-add {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.task-add:hover {
		color: var(--foreground);
		border-color: var(--accent);
	}

	.task-add :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
	}
</style>
