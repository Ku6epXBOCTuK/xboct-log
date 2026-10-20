<script lang="ts">
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import type { TaskFieldValues, TaskPatch } from "#lib/tasks/fields.ts";
	import type { Project, Scope } from "#lib/types.ts";

	interface ScopeChoice {
		key: string;
		label: string;
	}

	interface Props {
		value: TaskFieldValues;
		projects: Project[];
		scopes: Scope[];
		editing?: boolean;
		onfield: (patch: TaskPatch) => void;
		onproject: (projectId: string) => void;
	}

	let {
		value,
		projects,
		scopes,
		editing = false,
		onfield,
		onproject,
	}: Props = $props();

	let scopeChoices = $derived<ScopeChoice[]>([
		{ key: "", label: "not selected" },
		...scopes.map((scope) => ({ key: String(scope.id), label: scope.name })),
	]);

	let scopeChoice = $derived(
		scopeChoices.find(
			(choice) =>
				choice.key === (value.scope_id === null ? "" : String(value.scope_id)),
		) ?? scopeChoices[0],
	);

	let projectChoice = $derived(
		projects.find((project) => project.id === value.project_id) ?? null,
	);
</script>

<div class="detail-grid">
	<div class={`field${scopes.length === 0 ? " wide" : ""}`}>
		Project
		<SingleSelect
			items={projects}
			value={projectChoice}
			getKey={(project) => project.id}
			getLabel={(project) => project.name}
			onselect={(project) => onproject(project.id)}
			variant="field"
			placeholder="Select project"
			ariaLabel="Project"
		/>
	</div>
	{#if scopes.length > 0}
		<div
			class={`field ${
				editing && value.scope_id === null ? "scope-missing" : ""
			}`}
		>
			Scope
			<SingleSelect
				items={scopeChoices}
				value={scopeChoice}
				getKey={(choice) => choice.key}
				getLabel={(choice) => choice.label}
				onselect={(choice) =>
					onfield({
						scope_id: choice.key === "" ? null : Number(choice.key),
					})}
				variant="field"
				ariaLabel="Scope"
			/>
		</div>
	{/if}
</div>

<style>
	.wide {
		grid-column: 1 / -1;
	}

	.scope-missing :global(.select-trigger) {
		border-color: color-mix(in oklch, var(--accent) 55%, transparent);
		color: var(--accent-ink);
	}
</style>
