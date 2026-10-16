<script lang="ts">
	import DetailActions from "#lib/components/detail/DetailActions.svelte";
	import DetailFields from "#lib/components/detail/DetailFields.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import type { ProjectStore } from "#lib/state/projects.svelte.ts";
	import type { TaskStore } from "#lib/state/tasks.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import {
		splitTags,
		toSourceFile,
		toSourceLine,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import type { ClosedReason, Task } from "#lib/types.ts";
	import X from "~icons/lucide/x";

	interface Props {
		selected: Task | null;
		tasks: TaskStore;
		projects: ProjectStore;
		ondelete?: (id: string) => void;
	}

	let { selected = $bindable(), tasks, projects, ondelete }: Props = $props();

	let saving = $state(false);
	let failure = $state<string | null>(null);

	async function perform(id: string, work: () => Promise<Task>) {
		saving = true;
		failure = null;

		try {
			const updated = await work();
			if (selected?.id === id) selected = updated;
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}

	function save(patch: TaskPatch) {
		const current = selected;
		if (current === null) return;
		void perform(current.id, () => tasks.save(current.id, patch));
	}

	function saveTitle(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const title = input.value.trim();

		if (title === "") {
			failure = "title cannot be empty";
			input.value = selected?.title ?? "";
			return;
		}

		save({ title });
	}

	function saveSourceFile(event: Event) {
		save({
			source_file: toSourceFile(
				(event.currentTarget as HTMLInputElement).value,
			),
		});
	}

	function saveSourceLine(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const line = toSourceLine(input.value);

		if (line !== null && !Number.isInteger(line)) {
			failure = "source line must be a whole number";
			input.value =
				selected?.source_line === null || selected?.source_line === undefined
					? ""
					: String(selected.source_line);
			return;
		}

		save({ source_line: line });
	}

	function saveTags(event: Event) {
		save({ tags: splitTags((event.currentTarget as HTMLInputElement).value) });
	}

	function saveDescription(event: Event) {
		save({ description: (event.currentTarget as HTMLTextAreaElement).value });
	}

	function moveTo(event: Event) {
		const current = selected;
		if (current === null) return;

		const projectId = (event.currentTarget as HTMLSelectElement).value;
		if (projectId === current.project_id) return;

		void perform(current.id, () => tasks.moveTo(current.id, projectId));
	}

	function close(reason: ClosedReason) {
		const current = selected;
		if (current === null) return;
		void perform(current.id, () => tasks.close(current.id, reason));
	}

	function reopen() {
		save({ status: "open" });
	}

	async function remove() {
		const current = selected;
		if (current === null) return;

		const id = current.id;
		saving = true;
		failure = null;

		try {
			await tasks.destroy(id);
			if (selected?.id === id) selected = null;
			ondelete?.(id);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}
</script>

{#if selected !== null}
	<aside class="detail-panel" aria-label="Task details">
		<div class="detail-top">
			<span class="epic-badge">{selected.id}</span>
			<button
				class="close-detail"
				onclick={() => (selected = null)}
				aria-label="Close task details"
			>
				<X />
			</button>
		</div>
		<input
			class="title-input"
			value={selected.title}
			onchange={saveTitle}
			aria-label="Title"
		/>
		<ErrorNote message={failure} />
		<DetailFields
			task={selected}
			projects={projects.all}
			epics={tasks.epics}
			{saving}
			onstatus={(status) => save({ status })}
			onpriority={(priority) => save({ priority })}
			ontype={(isEpic) => save({ is_epic: isEpic })}
			onproject={moveTo}
			onepic={(epicId) => save({ epic_id: epicId })}
			ontags={saveTags}
			onsourcefile={saveSourceFile}
			onsourceline={saveSourceLine}
			ondescription={saveDescription}
		/>
		<DetailActions
			closed={selected.closed_at !== null}
			{saving}
			onclose={close}
			onreopen={reopen}
			ondelete={remove}
		/>
	</aside>
{/if}

<style>
	.detail-panel {
		width: var(--detail-w);
		min-width: var(--detail-w);
		height: 100%;
		border-left: 1px solid var(--border);
		background: var(--panel);
		padding: var(--space-6) var(--space-6) var(--space-8);
		overflow: auto;
	}

	.detail-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.title-input {
		width: 100%;
		font-size: var(--text-xl);
		line-height: 1.25;
		margin: var(--space-3) 0 var(--space-5);
		letter-spacing: -0.02em;
		font-weight: 600;
		color: var(--foreground);
		background: transparent;
		border: 0;
		border-bottom: 1px solid transparent;
		border-radius: 0;
		padding: 0 0 var(--space-1);
		min-height: 2.5rem;
	}

	.title-input:focus {
		border-bottom-color: var(--accent);
		box-shadow: none;
	}

	@media (max-width: 1100px) {
		.detail-panel {
			padding-inline: var(--space-5);
		}
	}

	@media (max-width: 820px) {
		.detail-panel {
			position: fixed;
			right: 0;
			top: 0;
			width: min(var(--detail-w), calc(100vw - var(--sidebar-w)));
			min-width: 0;
			box-shadow: -0.9375rem 0 2.5rem rgb(0 0 0 / 0.5);
			z-index: 5;
		}
	}

	@media (max-width: 560px) {
		.detail-panel {
			width: calc(100vw - var(--sidebar-w));
		}
	}
</style>
