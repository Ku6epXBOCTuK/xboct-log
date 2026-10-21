<script lang="ts">
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type { TaskFieldValues, TaskPatch } from "#lib/tasks/fields.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import {
		scopeChoices as buildScopeChoices,
		scopeIdOf,
		scopeNameError,
		type ScopeChoice,
	} from "#lib/tasks/scopes.ts";
	import type { Project, Scope } from "#lib/types.ts";
	import Plus from "~icons/lucide/plus";
	import Check from "~icons/lucide/check";

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
	let scopeName = $state("");
	let scopeError = $state<string | null>(null);
	let savingScope = $state(false);
	let scopeInput = $state<HTMLInputElement | null>(null);

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

	$effect(() => {
		if (creatingScope) scopeInput?.focus();
	});

	function pickScope(choice: ScopeChoice) {
		creatingScope = false;
		scopeError = null;
		onfield({ scope_id: scopeIdOf(choice) });
	}

	function startScope() {
		creatingScope = true;
		scopeName = "";
		scopeError = null;
	}

	async function addScope() {
		const name = scopeName.trim();
		const invalid = scopeNameError(name);
		if (invalid !== null) {
			scopeError = invalid;
			return;
		}

		savingScope = true;
		scopeError = null;

		try {
			const id = await onnewscope(name);
			onfield({ scope_id: id });
			scopeName = "";
			creatingScope = false;
		} catch (error) {
			scopeError = messageOf(error);
		} finally {
			savingScope = false;
		}
	}

	function onScopeKeydown(event: KeyboardEvent) {
		if (event.key !== "Enter") return;
		if (event.ctrlKey || event.metaKey) return;
		event.preventDefault();
		event.stopPropagation();
		void addScope();
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
				onclick={startScope}
				aria-label="Add scope"
				title="Add scope"
			>
				<Plus />
			</button>
		</div>
		{#if creatingScope}
			<div class="scope-new">
				<input
					bind:this={scopeInput}
					bind:value={scopeName}
					placeholder="New scope name"
					aria-label="New scope name"
					onkeydown={onScopeKeydown}
				/>
				<button
					class="icon-button"
					type="button"
					onclick={() => void addScope()}
					disabled={savingScope || scopeName.trim() === ""}
					aria-label="Save scope"
					title="Save scope"
				>
					<Check />
				</button>
			</div>
			<ErrorNote message={scopeError} />
		{/if}
	</div>
</div>

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

	.scope-new {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.scope-new input {
		flex: 1;
		min-width: 0;
		border: 1px solid var(--border-strong);
		background: var(--field);
		color: var(--foreground);
		border-radius: var(--radius);
		padding: var(--space-2) var(--space-3);
		min-height: var(--control-h);
		outline: none;
		font-size: var(--text-md);
	}

	.scope-new input:focus {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
</style>
