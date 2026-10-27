<script lang="ts">
	import FilterBlock from "#lib/components/filters/FilterBlock.svelte";
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import type { Project } from "#lib/types.ts";
	import X from "~icons/lucide/x";

	interface Choice {
		key: string;
		label: string;
		value: string;
	}

	interface Props {
		projects: Project[];
		activeProject: string | null;
		source?: string;
		op?: string;
		entity?: string;
		from?: string;
		to?: string;
		ops: string[];
		onproject: (value: string | null) => void;
	}

	let {
		projects,
		activeProject,
		source = $bindable(""),
		op = $bindable(""),
		entity = $bindable(""),
		from = $bindable(""),
		to = $bindable(""),
		ops,
		onproject,
	}: Props = $props();

	const ANY_PROJECT: Choice = { key: "any", label: "Any project", value: "" };

	const ANY_SOURCE: Choice = { key: "any", label: "Any source", value: "" };
	const ANY_ENTITY: Choice = { key: "any", label: "Any entity", value: "" };

	const SOURCES: Choice[] = [
		ANY_SOURCE,
		{ key: "ui", label: "ui", value: "ui" },
		{ key: "mcp", label: "mcp", value: "mcp" },
		{ key: "cli", label: "cli", value: "cli" },
	];

	const ENTITIES: Choice[] = [
		ANY_ENTITY,
		{ key: "task", label: "task", value: "task" },
		{ key: "project", label: "project", value: "project" },
		{ key: "scope", label: "scope", value: "scope" },
		{ key: "tag", label: "tag", value: "tag" },
	];

	const ANY_OP: Choice = { key: "any", label: "Any operation", value: "" };

	const projectChoices = $derived<Choice[]>([
		ANY_PROJECT,
		...projects.map((project) => ({
			key: project.id,
			label: project.name,
			value: project.id,
		})),
	]);

	const opChoices = $derived<Choice[]>([
		ANY_OP,
		...ops.map((name) => ({ key: name, label: name, value: name })),
	]);

	const projectSelected = $derived(
		projectChoices.find((choice) => choice.value === (activeProject ?? "")) ??
			ANY_PROJECT,
	);
	const sourceSelected = $derived(
		SOURCES.find((choice) => choice.value === source) ?? ANY_SOURCE,
	);
	const opSelected = $derived(
		opChoices.find((choice) => choice.value === op) ?? ANY_OP,
	);
	const entitySelected = $derived(
		ENTITIES.find((choice) => choice.value === entity) ?? ANY_ENTITY,
	);

	function clear() {
		source = "";
		op = "";
		entity = "";
		from = "";
		to = "";
		onproject(null);
	}
</script>

<div class="filters">
	<FilterBlock
		label="project"
		active={activeProject !== null}
		onreset={() => onproject(null)}
	>
		<SingleSelect
			items={projectChoices}
			value={projectSelected}
			getKey={(choice) => choice.key}
			getLabel={(choice) => choice.label}
			onselect={(choice) =>
				onproject(choice.value === "" ? null : choice.value)}
			searchable
			searchPlaceholder="Search projects"
			ariaLabel="Filter by project"
		/>
	</FilterBlock>
	<FilterBlock
		label="source"
		active={source !== ""}
		onreset={() => (source = "")}
	>
		<SingleSelect
			items={SOURCES}
			value={sourceSelected}
			getKey={(choice) => choice.key}
			getLabel={(choice) => choice.label}
			onselect={(choice) => (source = choice.value)}
			ariaLabel="Filter by source"
		/>
	</FilterBlock>
	<FilterBlock label="operation" active={op !== ""} onreset={() => (op = "")}>
		<SingleSelect
			items={opChoices}
			value={opSelected}
			getKey={(choice) => choice.key}
			getLabel={(choice) => choice.label}
			onselect={(choice) => (op = choice.value)}
			searchable
			searchPlaceholder="Search operations"
			ariaLabel="Filter by operation"
		/>
	</FilterBlock>
	<FilterBlock
		label="entity"
		active={entity !== ""}
		onreset={() => (entity = "")}
	>
		<SingleSelect
			items={ENTITIES}
			value={entitySelected}
			getKey={(choice) => choice.key}
			getLabel={(choice) => choice.label}
			onselect={(choice) => (entity = choice.value)}
			ariaLabel="Filter by entity"
		/>
	</FilterBlock>
	<FilterBlock label="from" active={from !== ""} onreset={() => (from = "")}>
		<label class="date-field">
			<span>From</span>
			<input class="date-input" type="date" bind:value={from} />
		</label>
	</FilterBlock>
	<FilterBlock label="to" active={to !== ""} onreset={() => (to = "")}>
		<label class="date-field">
			<span>To</span>
			<input class="date-input" type="date" bind:value={to} />
		</label>
	</FilterBlock>
	<button class="clear-filters" onclick={clear}>
		<X /> Clear
	</button>
</div>

<style>
	.filters {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		padding: 0 var(--edge-pad) var(--space-4);
	}

	.date-field {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-h);
		padding: 0 var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.date-field:hover {
		background: var(--hover);
	}

	.date-field:focus-within {
		border-color: var(--accent);
	}

	.date-input {
		border: 0;
		background: transparent;
		color: var(--foreground);
		font-family: inherit;
		font-size: var(--text-sm);
		outline: none;
	}

	.clear-filters {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		padding: 0 var(--space-3);
		min-height: var(--control-h);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.clear-filters:hover {
		background: var(--hover);
		color: var(--foreground);
	}

	.clear-filters :global(svg) {
		width: 0.875rem;
		height: 0.875rem;
	}
</style>
