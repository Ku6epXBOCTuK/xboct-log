<script lang="ts">
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";

	interface Props {
		projects: ProjectStore;
		onclose: () => void;
	}

	let { projects, onclose }: Props = $props();

	let id = $state("");
	let name = $state("");
	let prefix = $state("");
	let creating = $state(false);
	let failure = $state<string | null>(null);

	async function submit(event: SubmitEvent) {
		event.preventDefault();

		const cleanId = id.trim();
		const cleanName = name.trim();
		const cleanPrefix = prefix.trim();
		failure = null;

		if (cleanId === "" || cleanName === "" || cleanPrefix === "") {
			failure = "id, name and prefix are required";
			return;
		}

		creating = true;
		try {
			await projects.create({
				id: cleanId,
				name: cleanName,
				prefix: cleanPrefix,
			});
			onclose();
		} catch (error) {
			failure = messageOf(error);
		} finally {
			creating = false;
		}
	}
</script>

<form class="project-create" onsubmit={submit}>
	<input bind:value={id} placeholder="id" aria-label="Project id" />
	<input bind:value={name} placeholder="name" aria-label="Project name" />
	<input bind:value={prefix} placeholder="PREFIX" aria-label="Project prefix" />
	<ErrorNote message={failure} class="project-error" />
	<div class="project-create-actions">
		<button class="new-task" type="submit" disabled={creating}>
			{creating ? "creating…" : "Create"}
		</button>
		<button class="icon-button" type="button" onclick={onclose}>
			Cancel
		</button>
	</div>
</form>
