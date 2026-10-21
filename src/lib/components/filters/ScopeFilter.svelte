<script lang="ts">
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import type { Scope } from "#lib/types.ts";
	import Layers from "~icons/lucide/layers";

	interface Props {
		value: "any" | "none" | number;
		scopes: Scope[];
		countScope: (scopeId: number) => number;
		countActiveScope: (scopeId: number) => number;
		onselect: (value: "any" | "none" | number) => void;
	}

	let { value, scopes, countScope, countActiveScope, onselect }: Props =
		$props();

	interface Choice {
		key: string;
		label: string;
		meta: string;
		keywords: string;
		next: "any" | "none" | number;
	}

	const ANY: Choice = {
		key: "any",
		label: "Scope: any",
		meta: "",
		keywords: "any",
		next: "any",
	};

	const NONE: Choice = {
		key: "none",
		label: "Scope: none",
		meta: "",
		keywords: "none",
		next: "none",
	};

	const multiProject = $derived(
		new Set(scopes.map((scope) => scope.project_id)).size > 1,
	);

	const choices = $derived<Choice[]>([
		ANY,
		NONE,
		...scopes.map((scope) => ({
			key: String(scope.id),
			label: `${multiProject ? `${scope.project_id}: ` : ""}${scope.name}`,
			meta: `${countActiveScope(scope.id)}/${countScope(scope.id)}`,
			keywords: `${scope.project_id} ${scope.name}`,
			next: scope.id,
		})),
	]);

	const selected = $derived(
		choices.find((choice) => choice.next === value) ?? ANY,
	);
</script>

{#snippet icon()}
	<Layers />
{/snippet}

<SingleSelect
	items={choices}
	value={selected}
	getKey={(choice) => choice.key}
	getLabel={(choice) => choice.label}
	getKeywords={(choice) => choice.keywords}
	getMeta={(choice) => choice.meta}
	onselect={(choice) => onselect(choice.next)}
	{icon}
	searchable
	searchPlaceholder="Search scopes"
	ariaLabel="Filter by scope"
/>
