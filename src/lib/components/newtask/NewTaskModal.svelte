<script lang="ts">
	import NewProjectForm from "#lib/components/newtask/NewProjectForm.svelte";
	import TaskForm from "#lib/components/newtask/TaskForm.svelte";
	import Modal from "@ku6epxboctuk/ui-kit/components/Modal";
	import { useBoard } from "#lib/state/board.svelte.ts";

	interface Props {
		open: boolean;
		initialProject?: string;
		initialEpic?: string | null;
		initialScope?: number | null;
		onopen?: (id: string) => void;
	}

	let {
		open = $bindable(),
		initialProject,
		initialEpic = null,
		initialScope = null,
		onopen,
	}: Props = $props();

	const { projects } = useBoard();

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
			initialProject={createdProject ?? initialProject}
			{initialEpic}
			{initialScope}
			onclose={close}
			{onopen}
		/>
	{/if}
</Modal>
