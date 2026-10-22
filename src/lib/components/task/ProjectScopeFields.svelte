<script lang="ts">
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import type { TaskFieldValues, TaskPatch } from "#lib/tasks/fields.ts";
	import {
		scopeChoices as buildScopeChoices,
		scopeIdOf,
		type ScopeChoice,
	} from "#lib/tasks/scopes.ts";
	import type { Project, Scope } from "#lib/types.ts";
	import Plus from "~icons/lucide/plus";
	import ScopeCreateDialog from "./ScopeCreateDialog.svelte";

	interface Props {
		value: TaskFieldValues;
		projects: Project[];
		scopes: Scope[];
		editing?: boolean;
		onfield: (patch: TaskPatch) => void;
		onproject: (projectId: string) => void;
		onnewscope: (name: string) => Promise<number>;
	}

	let {
		value,
		projects,
		scopes,
		editing = false,
		onfield,
		onproject,
		onnewscope,
	}: Props = $props();

	let creatingScope = $state(false);

	let scopeChoices = $derived<ScopeChoice[]>(buildScopeChoices(scopes));

	let scopeChoice = $derived(
		scopeChoices.find(
			(choice) =>
				choice.key === (value.scope_id === null ? "" : String(value.scope_id)),
		) ?? scopeChoices[0],
	);

	let projectChoice = $derived(
		projects.find((project) => project.id === value.project_id) ?? null,
	);

	function pickScope(choice: ScopeChoice) {
		onfield({ scope_id: scopeIdOf(choice) });
	}

	async function addScope(name: string) {
		const id = await onnewscope(name);
		onfield({ scope_id: id });
	}
</script>

<div class="detail-grid">
	<div class="field">
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
	<div
		class={`field${!editing && value.scope_id === null ? " scope-missing" : ""}`}
	>
		Scope
		<div class="scope-row">
			<SingleSelect
				items={scopeChoices}
				value={scopeChoice}
				getKey={(choice) => choice.key}
				getLabel={(choice) => choice.label}
				onselect={pickScope}
				variant="field"
				ariaLabel="Scope"
			/>
			<button
				class="icon-button"
				type="button"
				onclick={() => (creatingScope = true)}
				aria-label="Add scope"
				title="Add scope"
			>
				<Plus />
			</button>
		</div>
	</div>
</div>

<ScopeCreateDialog
	open={creatingScope}
	oncreate={addScope}
	onclose={() => (creatingScope = false)}
/>

<style>
	.scope-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.scope-row :global(.select) {
		flex: 1;
		min-width: 0;
	}

	.scope-missing :global(.select-trigger) {
		border-color: color-mix(in oklch, var(--accent) 55%, transparent);
		color: var(--accent-ink);
	}
</style>
