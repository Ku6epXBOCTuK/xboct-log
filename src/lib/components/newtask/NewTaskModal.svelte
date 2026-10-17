<script lang="ts">
	import NewProjectForm from "#lib/components/newtask/NewProjectForm.svelte";
	import TaskForm from "#lib/components/newtask/TaskForm.svelte";
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import type { Task } from "#lib/types.ts";
	import X from "~icons/lucide/x";

	interface Props {
		open: boolean;
		projects: ProjectStore;
		scopes: ScopeStore;
		tasks: TaskStore;
		oncreated: (task: Task) => void;
	}

	let {
		open = $bindable(),
		projects,
		scopes,
		tasks,
		oncreated,
	}: Props = $props();

	let panel: HTMLDialogElement | undefined = $state();
	let initialProject = $state<string | undefined>(undefined);

	$effect(() => {
		if (open && panel !== undefined && !panel.open) {
			initialProject = undefined;
			panel.showModal();
			return;
		}

		if (!open && panel?.open) panel.close();
	});

	function close() {
		open = false;
	}
</script>

<dialog
	bind:this={panel}
	class="modal-panel"
	aria-label="New task"
	onclose={() => (open = false)}
>
	<div class="modal-top">
		<h2>New task</h2>
		<IconButton label="Close new task form" onclick={close}>
			<X />
		</IconButton>
	</div>

	{#if open && projects.active.length === 0}
		<div class="panel-body">
			<NewProjectForm
				{projects}
				oncreated={(project) => (initialProject = project.id)}
			/>
		</div>
	{:else if open}
		<TaskForm
			{tasks}
			{scopes}
			projects={projects.active}
			{initialProject}
			{oncreated}
			onclose={close}
		/>
	{/if}
</dialog>

<style>
	.modal-panel {
		width: 720px;
		max-width: calc(100vw - var(--space-8));
		max-height: calc(100dvh - 2 * var(--edge-pad));
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel);
		color: var(--foreground);
		box-shadow: 0 1.5rem 3.75rem rgb(0 0 0 / 0.55);
		overflow: hidden;
	}

	.modal-panel[open] {
		display: flex;
		flex-direction: column;
	}

	.modal-panel::backdrop {
		background: rgb(0 0 0 / 0.6);
	}

	.modal-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex: none;
		padding: var(--edge-pad) var(--edge-pad) var(--space-4);
	}

	.modal-top h2 {
		margin: 0;
		font-size: var(--text-lg);
		letter-spacing: -0.01em;
		color: var(--foreground);
	}

	.panel-body {
		padding: 0 var(--edge-pad) var(--space-5);
	}
</style>
