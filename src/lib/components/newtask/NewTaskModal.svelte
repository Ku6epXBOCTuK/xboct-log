<script lang="ts">
	import NewProjectForm from "#lib/components/newtask/NewProjectForm.svelte";
	import TaskForm from "#lib/components/newtask/TaskForm.svelte";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import type { Task } from "#lib/types.ts";
	import X from "~icons/lucide/x";

	interface Props {
		open: boolean;
		projects: ProjectStore;
		tasks: TaskStore;
		oncreated: (task: Task) => void;
	}

	let { open = $bindable(), projects, tasks, oncreated }: Props = $props();

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
		<button
			class="close-detail"
			type="button"
			onclick={close}
			aria-label="Close new task form"
		>
			<X />
		</button>
	</div>

	{#if open && projects.active.length === 0}
		<NewProjectForm
			{projects}
			oncreated={(project) => (initialProject = project.id)}
		/>
	{:else if open}
		<TaskForm
			{tasks}
			projects={projects.active}
			{initialProject}
			{oncreated}
			onclose={close}
		/>
	{/if}
</dialog>
