<script lang="ts">
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import type { Task } from "#lib/types.ts";
	import FolderKanban from "~icons/lucide/folder-kanban";

	interface Props {
		value: string;
		epics: Task[];
		countEpic: (epicId: string) => number;
		onselect: (value: string) => void;
	}

	let { value, epics, countEpic, onselect }: Props = $props();

	interface Choice {
		key: string;
		label: string;
		meta: string;
		keywords: string;
	}

	const ANY: Choice = {
		key: "any",
		label: "Epic: any",
		meta: "",
		keywords: "any",
	};
	const NONE: Choice = {
		key: "none",
		label: "Epic: none",
		meta: "",
		keywords: "none",
	};

	const choices = $derived<Choice[]>([
		ANY,
		NONE,
		...epics.map((epic) => ({
			key: epic.id,
			label: `${epic.id} — ${epic.title}`,
			meta: String(countEpic(epic.id)),
			keywords: `${epic.id} ${epic.title}`,
		})),
	]);

	const selected = $derived(
		choices.find((choice) => choice.key === value) ?? ANY,
	);
</script>

{#snippet icon()}
	<FolderKanban />
{/snippet}

<SingleSelect
	items={choices}
	value={selected}
	getKey={(choice) => choice.key}
	getLabel={(choice) => choice.label}
	getKeywords={(choice) => choice.keywords}
	getMeta={(choice) => choice.meta}
	onselect={(choice) => onselect(choice.key)}
	{icon}
	searchable
	searchPlaceholder="Search epics"
	ariaLabel="Filter by epic"
/>
