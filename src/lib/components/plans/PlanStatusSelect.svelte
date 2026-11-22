<script lang="ts">
	import type { PlanStatus } from "#lib/api/plans.ts";
	import Select from "@ku6epxboctuk/ui-kit/components/Select.svelte";
	import { createSelect } from "@ku6epxboctuk/ui-kit/headless/select.svelte.ts";
	import ChevronDown from "~icons/lucide/chevron-down";
	import PlanStatusDot from "./PlanStatusDot.svelte";

	interface Props {
		value: PlanStatus;
		saving?: boolean;
		onchange: (status: PlanStatus) => void;
	}

	let { value, saving = false, onchange }: Props = $props();

	const options: { value: PlanStatus; label: string }[] = [
		{ value: "backlog", label: "Backlog" },
		{ value: "active", label: "Active" },
		{ value: "done", label: "Done" },
		{ value: "cancelled", label: "Cancelled" },
	];

	const select = createSelect<(typeof options)[number]>({
		items: () => options,
		getLabel: (option) => option.label,
		onPick: (option) => onchange(option.value),
	});

	const labelOf = (status: PlanStatus) =>
		options.find((option) => option.value === status)?.label ?? status;
</script>

{#snippet trigger()}
	<button
		type="button"
		class="ui-select-trigger"
		aria-haspopup="listbox"
		aria-expanded={select.open}
		aria-label="Plan status"
		disabled={saving}
		onclick={() => select.toggle()}
	>
		<PlanStatusDot status={value} />
		<span class="ui-select-trigger-label">{labelOf(value)}</span>
		<span class="ui-select-trigger-caret">
			<ChevronDown />
		</span>
	</button>
{/snippet}

{#snippet option(item: (typeof options)[number])}
	<PlanStatusDot status={item.value} />
	<span class="ui-select-option-label">{item.label}</span>
{/snippet}

<Select
	{select}
	getKey={(item) => item.value}
	{trigger}
	{option}
	isSelected={(item) => item.value === value}
	size="sm"
	variant="filter"
	listLabel="Plan status"
/>
