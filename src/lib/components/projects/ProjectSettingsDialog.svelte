<script lang="ts">
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { ScopeStore } from "#lib/state/scopes.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import { countTasksInScope } from "#lib/tasks/filter.ts";
	import { INBOX_PROJECT_ID, type Project } from "#lib/types.ts";
	import Plus from "~icons/lucide/plus";
	import Trash2 from "~icons/lucide/trash-2";
	import X from "~icons/lucide/x";

	interface Props {
		open: boolean;
		project: Project | null;
		projects: ProjectStore;
		scopes: ScopeStore;
		tasks: TaskStore;
		onclose: () => void;
	}

	let { open, project, projects, scopes, tasks, onclose }: Props = $props();

	let panel: HTMLDialogElement | undefined = $state();
	let name = $state("");
	let newScope = $state("");
	let failure = $state<string | null>(null);
	let saving = $state(false);
	let confirmingId = $state<number | null>(null);
	let lastProjectId: string | null = null;

	const projectScopes = $derived(
		project === null ? [] : scopes.listFor(project.id),
	);

	$effect(() => {
		if (open && project !== null && panel !== undefined && !panel.open) {
			panel.showModal();
			return;
		}

		if (!open && panel?.open) panel.close();
	});

	$effect(() => {
		const id = project?.id ?? null;
		if (id === lastProjectId) return;
		lastProjectId = id;
		name = project?.name ?? "";
		newScope = "";
		failure = null;
		confirmingId = null;
	});

	async function run(work: () => Promise<unknown>) {
		saving = true;
		failure = null;
		try {
			await work();
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}

	function renameProject() {
		const current = project;
		if (current === null) return;
		const clean = name.trim();
		if (clean === "" || clean === current.name) return;
		void run(() => projects.rename(current.id, clean));
	}

	function toggleArchived() {
		const current = project;
		if (current === null) return;
		void run(() =>
			projects.setArchived(current.id, current.archived_at === null),
		);
	}

	function addScope(event: SubmitEvent) {
		event.preventDefault();
		const current = project;
		if (current === null) return;
		const clean = newScope.trim();
		if (clean === "") return;
		void run(async () => {
			await scopes.create({ project_id: current.id, name: clean });
			newScope = "";
		});
	}

	function renameScope(id: number, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const clean = input.value.trim();
		const scope = projectScopes.find((item) => item.id === id);
		if (clean === "" || scope === undefined || clean === scope.name) {
			input.value = scope?.name ?? "";
			return;
		}
		void run(() => scopes.rename(id, clean));
	}

	function removeScope(id: number) {
		void run(async () => {
			await scopes.destroy(id);
			tasks.clearScope(id);
			confirmingId = null;
		});
	}
</script>

<dialog
	bind:this={panel}
	class="modal-panel"
	aria-label="Project settings"
	{onclose}
>
	{#if project !== null}
		<div class="modal-top">
			<h2>Project settings</h2>
			<button
				class="close-detail"
				type="button"
				onclick={() => panel?.close()}
				aria-label="Close project settings"
			>
				<X />
			</button>
		</div>

		<section class="settings-section">
			<h3>Project</h3>
			<label class="field">
				Name
				<div class="inline">
					<input bind:value={name} aria-label="Project name" />
					<button
						class="icon-button"
						type="button"
						onclick={renameProject}
						disabled={saving ||
							name.trim() === project.name ||
							name.trim() === ""}
					>
						Save
					</button>
				</div>
			</label>
			{#if project.id !== INBOX_PROJECT_ID}
				<button
					class="icon-button archive-toggle"
					type="button"
					onclick={toggleArchived}
					disabled={saving}
				>
					{project.archived_at === null ? "Archive project" : "Restore project"}
				</button>
			{/if}
		</section>

		<section class="settings-section">
			<h3>Scopes</h3>
			{#if projectScopes.length === 0}
				<p class="scope-hint">
					No scopes yet. Add one to start triaging tasks.
				</p>
			{/if}
			<ul class="scope-list">
				{#each projectScopes as scope (scope.id)}
					<li class="scope-item">
						<input
							value={scope.name}
							aria-label={`Rename ${scope.name}`}
							onchange={(event) => renameScope(scope.id, event)}
						/>
						<span class="scope-count">
							{countTasksInScope(tasks.tasks, scope.id)}
						</span>
						{#if confirmingId === scope.id}
							<span class="scope-warning">
								{countTasksInScope(tasks.tasks, scope.id)} tasks will become unassigned
							</span>
							<button
								class="danger armed"
								type="button"
								onclick={() => removeScope(scope.id)}
								disabled={saving}
							>
								Confirm
							</button>
							<button
								class="icon-button"
								type="button"
								onclick={() => (confirmingId = null)}
							>
								Cancel
							</button>
						{:else}
							<button
								class="project-icon"
								type="button"
								onclick={() => (confirmingId = scope.id)}
								aria-label={`Delete ${scope.name}`}
							>
								<Trash2 />
							</button>
						{/if}
					</li>
				{/each}
			</ul>
			<form class="scope-add" onsubmit={addScope}>
				<input
					bind:value={newScope}
					placeholder="New scope"
					aria-label="New scope name"
				/>
				<button
					class="icon-button"
					type="submit"
					disabled={saving || newScope.trim() === ""}
				>
					<Plus />
				</button>
			</form>
		</section>

		<ErrorNote message={failure} />
	{/if}
</dialog>

<style>
	.modal-panel {
		width: 480px;
		max-width: calc(100vw - var(--space-8));
		max-height: calc(100vh - var(--space-12));
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel);
		color: var(--foreground);
		padding: var(--space-6);
		box-shadow: 0 1.5rem 3.75rem rgb(0 0 0 / 0.55);
	}

	.modal-panel::backdrop {
		background: rgb(0 0 0 / 0.6);
	}

	.modal-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-5);
	}

	.modal-top h2 {
		margin: 0;
		font-size: var(--text-lg);
		letter-spacing: -0.01em;
		color: var(--foreground);
	}

	.settings-section {
		margin-bottom: var(--space-5);
	}

	.settings-section h3 {
		margin: 0 0 var(--space-3);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: var(--space-3);
	}

	.inline,
	.scope-add,
	.scope-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.field input,
	.scope-item input,
	.scope-add input {
		flex: 1;
		min-width: 0;
		border: 1px solid var(--border-strong);
		background: var(--field);
		color: var(--foreground);
		border-radius: var(--radius);
		padding: var(--space-2) var(--space-3);
		min-height: var(--control-h);
		outline: none;
		font-size: var(--text-md);
	}

	.field input:focus,
	.scope-item input:focus,
	.scope-add input:focus {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}

	.archive-toggle {
		width: 100%;
		justify-content: center;
	}

	.scope-hint {
		margin: 0 0 var(--space-3);
		color: var(--text-muted);
		font-size: var(--text-xs);
		line-height: 1.5;
	}

	.scope-list {
		list-style: none;
		margin: 0 0 var(--space-3);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.scope-count {
		min-width: 1.5rem;
		text-align: right;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.scope-warning {
		color: var(--accent-ink);
		font-size: var(--text-xs);
	}

	.danger {
		border: 1px solid color-mix(in oklch, var(--accent) 45%, transparent);
		background: transparent;
		color: var(--accent-ink);
		border-radius: var(--radius);
		padding: 0 var(--space-3);
		min-height: var(--control-h);
		font-size: var(--text-sm);
	}

	.danger:hover {
		background: var(--danger-surface);
	}

	.danger.armed {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--on-accent);
		font-weight: 600;
	}
</style>
