<script lang="ts">
	import NewProjectForm from "#lib/components/newtask/NewProjectForm.svelte";
	import TaskForm from "#lib/components/newtask/TaskForm.svelte";
	import Modal from "#lib/components/ui/Modal.svelte";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";

	interface Props {
		open: boolean;
		projects: ProjectStore;
		scopes: ScopeStore;
		tasks: TaskStore;
		initialProject?: string;
		initialEpic?: string | null;
		initialScope?: number | null;
	}

	let {
		open = $bindable(),
		projects,
		scopes,
		tasks,
		initialProject,
		initialEpic = null,
		initialScope = null,
	}: Props = $props();

	let createdProject = $state<string | undefined>(undefined);

	$effect(() => {
		if (open) createdProject = undefined;
	});

	function close() {
		open = false;
	}
</script>

<Modal {open} title="New task" size="wide" onclose={() => (open = false)}>
	{#if open && projects.active.length === 0}
		<NewProjectForm
			{projects}
			oncreated={(project) => (createdProject = project.id)}
		/>
	{:else if open}
		<TaskForm
			{tasks}
			{scopes}
			projects={projects.active}
			initialProject={createdProject ?? initialProject}
			{initialEpic}
			{initialScope}
			onclose={close}
		/>
	{/if}
</Modal>
