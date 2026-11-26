<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import Select from "@ku6epxboctuk/ui-kit/components/Select.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";
	import { createSelect } from "@ku6epxboctuk/ui-kit/headless/select.svelte.ts";
	import {
		isExactTerm,
		matchesSearch,
		parseSearchQuery,
	} from "#lib/tasks/query/search.ts";
	import type { Task } from "#lib/types.ts";

	interface Props {
		items: Task[];
		value: string[];
		onadd: (id: string) => void;
	}

	let { items, value, onadd }: Props = $props();

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
		onPick: (task) => {
			onadd(task.id);
			select.setQuery("");
		},
	});

	const uid = $props.id();
	const listId = `${uid}-list`;
</script>

{#snippet trigger()}
	<div class="add-row">
		<TextInput
			class="task-search"
			placeholder="Search tasks by id or title"
			aria-label="Search tasks by id or title"
			value={select.query}
			readonly
			onclick={() => select.show()}
		/>
		<Button
			class="ui-select-trigger"
			type="button"
			aria-label="Add a task to the plan"
			aria-controls={listId}
			aria-expanded={select.open}
			aria-haspopup="listbox"
			onclick={() => select.toggle()}
		>
			Add task
		</Button>
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
	searchable
	searchPlaceholder="Search tasks"
	listLabel="Plan items"
	{listId}
	emptyLabel="No tasks left"
	variant="field"
/>

<style>
	.add-row {
		display: flex;
		align-items: center;
		gap: var(--ui-space-2);
		margin-bottom: var(--ui-space-3);
	}

	:global(.task-search) {
		flex: 1 1 auto;
		min-width: 0;
		cursor: text;
	}
</style>
