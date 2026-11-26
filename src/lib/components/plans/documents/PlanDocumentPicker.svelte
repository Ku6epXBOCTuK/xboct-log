<script lang="ts">
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import Select from "@ku6epxboctuk/ui-kit/components/Select.svelte";
	import { createSelect } from "@ku6epxboctuk/ui-kit/headless/select.svelte.ts";
	import type { Document } from "#lib/api/plans/documents.ts";
	import type { PlanStore } from "#lib/state/plans/plans.svelte.ts";
	import Plus from "~icons/lucide/plus";

	interface Props {
		store: PlanStore;
		planId: string;
		items: Document[];
	}

	let { store, planId, items }: Props = $props();

	function label(document: Document): string {
		return `${document.key ?? document.id} — ${document.title}`;
	}

	const select = createSelect<Document>({
		items: () => items,
		getLabel: (document) => label(document),
		getKeywords: (document) =>
			`${document.key ?? document.id} ${document.title} ${document.kind}`,
		onPick: (document) => {
			void store.linkDocument(planId, document.id);
		},
	});

	const uid = $props.id();
	const listId = `${uid}-list`;
</script>

{#snippet trigger()}
	<Button
		class="ui-select-trigger"
		type="button"
		aria-label="Document to link"
		aria-controls={listId}
		aria-expanded={select.open}
		aria-haspopup="listbox"
		onclick={() => select.toggle()}
	>
		{#snippet icon()}
			<Plus />
		{/snippet}
	</Button>
{/snippet}

{#snippet option(document: Document)}
	<span class="ui-select-option-label">{label(document)}</span>
{/snippet}

<Select
	{select}
	getKey={(document) => document.id}
	{trigger}
	{option}
	searchable
	searchPlaceholder="Search documents"
	listLabel="Document to link"
	{listId}
	emptyLabel="No documents left"
	variant="field"
/>
