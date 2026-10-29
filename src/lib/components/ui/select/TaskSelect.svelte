<script lang="ts">
	import {
		isExactTerm,
		matchesSearch,
		parseSearchQuery,
	} from "#lib/tasks/search.ts";
	import type { Task } from "#lib/types.ts";
	import Chip from "@ku6epxboctuk/ui-kit/components/Chip";
	import Select from "@ku6epxboctuk/ui-kit/components/Select";
	import { createSelect } from "@ku6epxboctuk/ui-kit/headless/select";
	import Plus from "~icons/lucide/plus";

	interface Props {
		items: Task[];
		value: string[];
		onadd: (id: string) => void;
		onremove: (id: string) => void;
		onopen?: (id: string) => void;
		onsearch?: (query: string) => void;
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
		onsearch,
		unavailable,
		placeholder = "Add task",
		ariaLabel = "Tasks",
		variant = "field",
		class: className = "",
	}: Props = $props();

	function label(task: Task): string {
		return `${task.id} — ${task.title}`;
	}

	function localMatch(task: Task, needle: string): boolean {
		const exact = parseSearchQuery(needle).filter(isExactTerm);
		if (exact.length === 0) return true;
		return matchesSearch(task, exact);
	}

	const select = createSelect<Task>({
		items: () => items.filter((task) => !value.includes(task.id)),
		getLabel: (task) => label(task),
		getKeywords: (task) => `${task.id} ${task.title}`,
		filter: localMatch,
		closeOnPick: false,
		onQuery: (query) => onsearch?.(query),
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
	<div class="ui-select-trigger task-trigger" role="presentation">
		{#each value as id (id)}
			{@const hint = unavailable?.(id) ?? null}
			<Chip
				unavailable={hint !== null}
				hint={hint ?? undefined}
				onopen={hint === null && onopen ? () => onopen(id) : undefined}
				openLabel={`Open ${id}`}
				removeLabel={`Remove ${id}`}
				onremove={() => onremove(id)}
			>
				{id}
			</Chip>
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
	<span class="ui-select-option-label">{label(task)}</span>
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
