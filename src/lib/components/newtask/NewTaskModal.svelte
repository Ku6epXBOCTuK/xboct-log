<script lang="ts">
	import NewProjectForm from "#lib/components/newtask/NewProjectForm.svelte";
	import TaskForm from "#lib/components/newtask/TaskForm.svelte";
	import Modal from "#lib/components/ui/Modal.svelte";
	import type { DraftStore } from "#lib/state/draft.svelte.ts";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TagStore } from "#lib/state/tags.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import type { UiStore } from "#lib/state/ui.svelte.ts";

	interface Props {
		open: boolean;
		projects: ProjectStore;
		scopes: ScopeStore;
		tasks: TaskStore;
		tags: TagStore;
		draftStore: DraftStore;
		ui: UiStore;
		initialProject?: string;
		initialEpic?: string | null;
		initialScope?: number | null;
		onopen?: (id: string) => void;
	}

	let {
		open = $bindable(),
		projects,
		scopes,
		tasks,
		tags,
		draftStore,
		ui,
		initialProject,
		initialEpic = null,
		initialScope = null,
		onopen,
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
			{tags}
			{draftStore}
			{ui}
			projects={projects.active}
			initialProject={createdProject ?? initialProject}
			{initialEpic}
			{initialScope}
			onclose={close}
			{onopen}
		/>
	{/if}
</Modal>
