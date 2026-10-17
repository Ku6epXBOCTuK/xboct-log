<script lang="ts">
	import type { Scope } from "#lib/types.ts";
	import ChevronDown from "~icons/lucide/chevron-down";
	import Layers from "~icons/lucide/layers";

	interface Props {
		value: "any" | "none" | number;
		scopes: Scope[];
		countScope: (scopeId: number) => number;
		onselect: (value: "any" | "none" | number) => void;
	}

	let { value, scopes, countScope, onselect }: Props = $props();

	const multiProject = $derived(
		new Set(scopes.map((scope) => scope.project_id)).size > 1,
	);

	function parse(raw: string): "any" | "none" | number {
		if (raw === "any" || raw === "none") return raw;
		return Number(raw);
	}
</script>

<label class="select-filter">
	<Layers />
	<select
		value={String(value)}
		onchange={(event) => onselect(parse(event.currentTarget.value))}
		aria-label="Filter by scope"
	>
		<option value="any">Scope: any</option>
		<option value="none">Scope: none</option>
		{#each scopes as scope (scope.id)}
			<option value={scope.id}>
				{multiProject ? `${scope.project_id}: ` : ""}{scope.name} ({countScope(
					scope.id,
				)})
			</option>
		{/each}
	</select>
	<ChevronDown />
</label>
