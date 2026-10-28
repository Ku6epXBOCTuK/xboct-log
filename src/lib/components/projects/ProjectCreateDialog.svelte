<script lang="ts">
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import Modal from "@ku6epxboctuk/ui-kit/components/Modal";
	import {
		projectIdError,
		projectPrefixError,
		repoError,
		slugifyProjectId,
		uniqueProjectId,
	} from "#lib/projects/create.ts";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";

	interface Props {
		open: boolean;
		projects: ProjectStore;
		onclose: () => void;
	}

	let { open, projects, onclose }: Props = $props();

	let name = $state("");
	let id = $state("");
	let prefix = $state("");
	let repo = $state("");
	let idTouched = $state(false);
	let creating = $state(false);
	let failure = $state<string | null>(null);
	let nameInput: HTMLInputElement | undefined = $state();
	let wasOpen = false;

	const idTaken = $derived(
		projects.all.some((project) => project.id === id.trim()),
	);
	const prefixTaken = $derived(
		projects.all.some(
			(project) => project.prefix.toUpperCase() === prefix.trim().toUpperCase(),
		),
	);

	$effect(() => {
		if (open && !wasOpen) {
			wasOpen = true;
			name = "";
			id = "";
			prefix = "";
			repo = "";
			idTouched = false;
			failure = null;
			return;
		}
		if (!open) wasOpen = false;
	});

	$effect(() => {
		if (open && nameInput !== undefined) nameInput.focus();
	});

	function onNameInput(value: string) {
		name = value;
		if (idTouched) return;
		id = uniqueProjectId(
			slugifyProjectId(value),
			projects.all.map((project) => project.id),
		);
	}

	function onIdInput(value: string) {
		idTouched = true;
		id = value;
	}

	function onPrefixInput(value: string) {
		prefix = value.toUpperCase();
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		failure = null;

		const cleanName = name.trim();
		const cleanId = id.trim();
		const cleanPrefix = prefix.trim().toUpperCase();
		const cleanRepo = repo.trim();

		if (cleanName === "") {
			failure = "Project name is required";
			return;
		}
		const idError = projectIdError(cleanId);
		if (idError !== null) {
			failure = idError;
			return;
		}
		const prefixError = projectPrefixError(cleanPrefix);
		if (prefixError !== null) {
			failure = prefixError;
			return;
		}
		if (idTaken) {
			failure = `Project id "${cleanId}" is already taken`;
			return;
		}
		if (prefixTaken) {
			failure = `Prefix "${cleanPrefix}" is already taken`;
			return;
		}
		const repositoryError = repoError(cleanRepo);
		if (repositoryError !== null) {
			failure = repositoryError;
			return;
		}

		creating = true;
		try {
			await projects.create({
				id: cleanId,
				name: cleanName,
				prefix: cleanPrefix,
				repo: cleanRepo === "" ? null : cleanRepo,
			});
			onclose();
		} catch (error) {
			failure = messageOf(error);
		} finally {
			creating = false;
		}
	}
</script>

<Modal {open} title="New project" {onclose}>
	<form class="project-create" onsubmit={submit}>
		<label class="field">
			Name
			<input
				bind:this={nameInput}
				class="field-control"
				value={name}
				placeholder="My best project"
				aria-label="Project name"
				oninput={(event) => onNameInput(event.currentTarget.value)}
			/>
			<span class="hint">Shown in the sidebar. Can be renamed later.</span>
		</label>

		<label class="field">
			Id
			<input
				class="field-control"
				value={id}
				placeholder="my-project"
				aria-label="Project id"
				oninput={(event) => onIdInput(event.currentTarget.value)}
			/>
			<span class="hint">
				Used in links and in the project_id parameter. Cannot be changed later.
			</span>
		</label>

		<label class="field">
			Prefix
			<input
				class="field-control"
				value={prefix}
				placeholder="MYPROJ"
				maxlength="6"
				aria-label="Project prefix"
				oninput={(event) => onPrefixInput(event.currentTarget.value)}
			/>
			<span class="hint">
				1-6 uppercase letters or digits. It starts every task id, like
				{prefix.trim() === "" ? "MCPG-42" : `${prefix.trim()}-42`}. Cannot be
				changed later.
			</span>
		</label>

		<label class="field">
			Repository
			<input
				class="field-control"
				value={repo}
				placeholder="github.com/owner/repo"
				aria-label="Project repository"
				oninput={(event) => (repo = event.currentTarget.value)}
			/>
			<span class="hint">
				Optional. Lets the CLI match this project by the git origin and tells an
				issue import where to look.
			</span>
		</label>

		<ErrorNote message={failure} />

		<div class="actions">
			<button class="new-task" type="submit" disabled={creating}>
				{creating ? "creating…" : "Create"}
			</button>
			<button class="icon-button" type="button" onclick={onclose}>
				Cancel
			</button>
		</div>
	</form>
</Modal>

<style>
	.project-create {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 400;
		line-height: 1.5;
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.actions button {
		flex: 1;
		justify-content: center;
	}
</style>
