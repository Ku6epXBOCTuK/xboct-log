<script lang="ts">
	import type { TaskFieldValues, TaskPatch } from "#lib/tasks/fields.ts";
	import type { Project, Scope } from "#lib/types.ts";

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

	function changeProject(event: Event) {
		onproject((event.currentTarget as HTMLSelectElement).value);
	}

	function changeScope(event: Event) {
		const picked = (event.currentTarget as HTMLSelectElement).value;
		onfield({ scope_id: picked === "" ? null : Number(picked) });
	}
</script>

<div class="detail-grid">
	<label class={`field${scopes.length === 0 ? " wide" : ""}`}>
		Project
		<select
			class="field-control"
			value={value.project_id}
			onchange={changeProject}
			aria-label="Project"
		>
			{#each projects as project (project.id)}
				<option value={project.id}>{project.name}</option>
			{/each}
		</select>
	</label>
	{#if scopes.length > 0}
		<label
			class={`field ${editing && value.scope_id === null ? "scope-missing" : ""}`}
		>
			Scope
			<select
				class="field-control"
				value={value.scope_id === null ? "" : String(value.scope_id)}
				onchange={changeScope}
			>
				<option value="">not selected</option>
				{#each scopes as scope (scope.id)}
					<option value={String(scope.id)}>{scope.name}</option>
				{/each}
			</select>
		</label>
	{/if}
</div>

<style>
	.wide {
		grid-column: 1 / -1;
	}

	.scope-missing .field-control {
		border-color: color-mix(in oklch, var(--accent) 55%, transparent);
		color: var(--accent-ink);
	}
</style>
