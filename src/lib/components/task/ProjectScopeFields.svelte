<script lang="ts">
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton";
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import { useTaskEditorSlot } from "#lib/state/task-editor.ts";
	import {
		scopeChoices as buildScopeChoices,
		scopeIdOf,
		type ScopeChoice,
	} from "#lib/tasks/scopes.ts";
	import Plus from "~icons/lucide/plus";
	import ScopeCreateDialog from "./ScopeCreateDialog.svelte";

	const slot = useTaskEditorSlot();
	const editor = $derived(slot.current);

	let creatingScope = $state(false);

	let scopeChoices = $derived<ScopeChoice[]>(buildScopeChoices(editor.scopes));

	let scopeChoice = $derived(
		scopeChoices.find(
			(choice) =>
				choice.key ===
				(editor.value.scope_id === null ? "" : String(editor.value.scope_id)),
		) ?? scopeChoices[0],
	);

	let projectChoice = $derived(
		editor.projects.find((project) => project.id === editor.value.project_id) ??
			null,
	);

	function pickScope(choice: ScopeChoice) {
		editor.onfield({ scope_id: scopeIdOf(choice) });
	}

	async function addScope(name: string) {
		const id = await editor.onnewscope(name);
		editor.onfield({ scope_id: id });
	}
</script>

<div class="detail-grid">
	<div class="field">
		Project
		<SingleSelect
			items={editor.projects}
			value={projectChoice}
			getKey={(project) => project.id}
			getLabel={(project) => project.name}
			onselect={(project) => editor.onproject(project.id)}
			variant="field"
			placeholder="Select project"
			ariaLabel="Project"
		/>
	</div>
	<div
		class={`field${!editor.editing && editor.value.scope_id === null ? " scope-missing" : ""}`}
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
			<IconButton
				label="Add scope"
				title="Add scope"
				variant="secondary"
				onclick={() => (creatingScope = true)}
			>
				<Plus />
			</IconButton>
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

	.scope-row :global(.ui-select) {
		flex: 1;
		min-width: 0;
	}

	.scope-missing :global(.ui-select-trigger) {
		border-color: color-mix(in oklch, var(--accent) 55%, transparent);
		color: var(--accent-ink);
	}
</style>
