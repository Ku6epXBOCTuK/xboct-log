<script lang="ts">
	import { createProject } from "#lib/remote/projects.remote.ts";
	import { createTask } from "#lib/remote/tasks.remote.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import {
		PRIORITIES,
		type Priority,
		type Project,
		type Task,
	} from "#lib/types.ts";
	import X from "~icons/lucide/x";

	interface Props {
		open: boolean;
		projects: Project[];
		epics: Task[];
		oncreated: (task: Task) => void;
		onprojectcreated: (project: Project) => void;
	}

	let {
		open = $bindable(),
		projects,
		epics,
		oncreated,
		onprojectcreated,
	}: Props = $props();

	let panel: HTMLDialogElement | undefined = $state();
	let titleInput: HTMLInputElement | undefined = $state();

	let projectId = $state("");
	let title = $state("");
	let description = $state("");
	let priority = $state<Priority>("medium");
	let type = $state<"task" | "epic">("task");
	let epicId = $state("");
	let sourceFile = $state("");
	let sourceLine = $state("");
	let tags = $state("");
	let keepOpen = $state(false);
	let saving = $state(false);
	let failure = $state<string | null>(null);

	let newProjectId = $state("");
	let newProjectName = $state("");
	let newProjectPrefix = $state("");
	let newProjectFailure = $state<string | null>(null);
	let creatingProject = $state(false);

	const epicOptions = $derived(
		epics.filter((epic) => epic.project_id === projectId),
	);

	function reset() {
		projectId = projects[0]?.id ?? "";
		title = "";
		description = "";
		priority = "medium";
		type = "task";
		epicId = "";
		sourceFile = "";
		sourceLine = "";
		tags = "";
		failure = null;
	}

	$effect(() => {
		if (open && panel !== undefined && !panel.open) {
			reset();
			panel.showModal();
			titleInput?.focus();
			return;
		}

		if (!open && panel?.open) panel.close();
	});

	async function submitProject() {
		const id = newProjectId.trim();
		const name = newProjectName.trim();
		const prefix = newProjectPrefix.trim();

		newProjectFailure = null;

		if (id === "" || name === "" || prefix === "") {
			newProjectFailure = "id, name and prefix are required";
			return;
		}

		creatingProject = true;

		try {
			const project = await createProject({ id, name, prefix });
			onprojectcreated(project);
			projectId = project.id;
			newProjectId = "";
			newProjectName = "";
			newProjectPrefix = "";
		} catch (error) {
			newProjectFailure = messageOf(error);
		} finally {
			creatingProject = false;
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		failure = null;

		const cleanTitle = title.trim();

		if (projectId === "") {
			failure = "create a project first";
			return;
		}

		if (cleanTitle === "") {
			failure = "title cannot be empty";
			return;
		}

		const rawLine = sourceLine.trim();
		const line = rawLine === "" ? null : Number(rawLine);

		if (line !== null && !Number.isInteger(line)) {
			failure = "source line must be a whole number";
			return;
		}

		const file = sourceFile.trim() === "" ? null : sourceFile.trim();

		if (line !== null && file === null) {
			failure = "source line requires source file";
			return;
		}

		saving = true;

		try {
			const created = await createTask({
				project_id: projectId,
				title: cleanTitle,
				description,
				priority,
				is_epic: type === "epic",
				epic_id: type === "epic" || epicId === "" ? null : epicId,
				source_file: file,
				source_line: line,
				tags: tags
					.split(",")
					.map((tag) => tag.trim())
					.filter((tag) => tag !== ""),
			});

			oncreated(created);

			if (keepOpen) {
				reset();
			} else {
				open = false;
			}
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
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
			onclick={() => (open = false)}
			aria-label="Close new task form"
		>
			<X />
		</button>
	</div>

	{#if projects.length === 0}
		<p class="modal-hint">No projects yet — create one first.</p>
		<div class="detail-grid">
			<label>
				Project id
				<input bind:value={newProjectId} placeholder="shop-web" />
			</label>
			<label>
				Prefix
				<input bind:value={newProjectPrefix} placeholder="SHOP" />
			</label>
		</div>
		<label class="detail-field">
			Project name
			<input bind:value={newProjectName} placeholder="Shop web" />
		</label>
		{#if newProjectFailure !== null}
			<p class="detail-error">{newProjectFailure}</p>
		{/if}
		<button
			class="icon-button"
			type="button"
			onclick={submitProject}
			disabled={creatingProject}
		>
			{creatingProject ? "creating…" : "Create project"}
		</button>
	{:else}
		<form onsubmit={submit}>
			<label class="detail-field">
				Project
				<select bind:value={projectId}>
					{#each projects as project (project.id)}
						<option value={project.id}>{project.name}</option>
					{/each}
				</select>
			</label>

			<label class="detail-field">
				Title
				<input
					bind:this={titleInput}
					bind:value={title}
					placeholder="What needs to be done"
				/>
			</label>

			<label class="detail-field">
				Description
				<textarea bind:value={description} placeholder="Markdown"></textarea>
			</label>

			<div class="detail-grid">
				<label>
					Priority
					<select bind:value={priority}>
						{#each PRIORITIES as option (option)}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
				<label>
					Type
					<select bind:value={type}>
						<option value="task">task</option>
						<option value="epic">epic</option>
					</select>
				</label>
			</div>

			{#if type === "task"}
				<label class="detail-field">
					Epic
					<select bind:value={epicId}>
						<option value="">none</option>
						{#each epicOptions as epic (epic.id)}
							<option value={epic.id}>{epic.id} — {epic.title}</option>
						{/each}
					</select>
				</label>
			{/if}

			<label class="detail-field">
				Comma-separated tags
				<input bind:value={tags} placeholder="checkout, payments" />
			</label>

			<div class="detail-grid">
				<label>
					Source file
					<input
						bind:value={sourceFile}
						placeholder="src/app/PaymentForm.tsx"
					/>
				</label>
				<label>
					Source line
					<input bind:value={sourceLine} placeholder="112" />
				</label>
			</div>

			{#if failure !== null}
				<p class="detail-error">{failure}</p>
			{/if}

			<div class="modal-actions">
				<label class="modal-check">
					<input type="checkbox" bind:checked={keepOpen} />
					Create another
				</label>
				<button
					class="icon-button"
					type="button"
					onclick={() => (open = false)}
				>
					Cancel
				</button>
				<button class="new-task" type="submit" disabled={saving}>
					{saving ? "creating…" : "Create task"}
				</button>
			</div>
		</form>
	{/if}
</dialog>
