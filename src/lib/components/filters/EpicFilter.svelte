<script lang="ts">
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import type { Task } from "#lib/types.ts";
	import FolderKanban from "~icons/lucide/folder-kanban";

	interface Props {
		value: string;
		epics: Task[];
		countEpic: (epicId: string) => number;
		countActiveEpic: (epicId: string) => number;
		onselect: (value: string) => void;
	}

	let { value, epics, countEpic, countActiveEpic, onselect }: Props = $props();

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
	const ONLY: Choice = {
		key: "only",
		label: "Epic: only epics",
		meta: "",
		keywords: "only epics",
	};
	const INSIDE: Choice = {
		key: "inside",
		label: "Epic: inside epics",
		meta: "",
		keywords: "inside epics",
	};

	const choices = $derived<Choice[]>([
		ANY,
		NONE,
		ONLY,
		INSIDE,
		...epics.map((epic) => ({
			key: epic.id,
			label: `${epic.id} — ${epic.title}`,
			meta: `${countActiveEpic(epic.id)}/${countEpic(epic.id)}`,
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
