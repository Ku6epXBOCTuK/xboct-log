<script lang="ts">
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import type { Project } from "#lib/types.ts";

	interface Props {
		projects: ProjectStore;
		oncreated: (project: Project) => void;
	}

	let { projects, oncreated }: Props = $props();

	let id = $state("");
	let name = $state("");
	let prefix = $state("");
	let creating = $state(false);
	let failure = $state<string | null>(null);

	async function submit() {
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
			const project = await projects.create({
				id: cleanId,
				name: cleanName,
				prefix: cleanPrefix,
			});
			oncreated(project);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			creating = false;
		}
	}
</script>

<p class="modal-hint">No projects yet — create one first.</p>
<div class="detail-grid">
	<label>
		Project id
		<input bind:value={id} placeholder="shop-web" />
	</label>
	<label>
		Prefix
		<input bind:value={prefix} placeholder="SHOP" />
	</label>
</div>
<label class="detail-field">
	Project name
	<input bind:value={name} placeholder="Shop web" />
</label>
<ErrorNote message={failure} />
<button class="icon-button" type="button" onclick={submit} disabled={creating}>
	{creating ? "creating…" : "Create project"}
</button>

<style>
	label {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}

	input {
		width: 100%;
		border: 1px solid var(--border-strong);
		background: var(--field);
		color: var(--foreground);
		border-radius: var(--radius);
		padding: var(--space-2) var(--space-3);
		min-height: var(--control-h);
		outline: none;
		font-size: var(--text-md);
		font-weight: 400;
	}

	input:focus {
		border-color: var(--accent);
	}

	.modal-hint {
		margin: 0 0 var(--space-4);
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}
</style>
