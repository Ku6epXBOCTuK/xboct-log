<script lang="ts">
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import { createTaskFinder } from "#lib/state/task-finder.svelte.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import type { Task } from "#lib/types.ts";
	import Button from "@ku6epxboctuk/ui-kit/components/Button.svelte";
	import Checkbox from "@ku6epxboctuk/ui-kit/components/Checkbox.svelte";
	import Modal from "@ku6epxboctuk/ui-kit/components/Modal.svelte";
	import TextInput from "@ku6epxboctuk/ui-kit/components/TextInput.svelte";

	interface Props {
		open: boolean;
		fileName: string;
		sourceTaskId: string;
		sourceDeleted?: boolean;
		copyable?: boolean;
		onsubmit: (target: string, copy: boolean) => Promise<string | null>;
		onclose: () => void;
	}

	let {
		open,
		fileName,
		sourceTaskId,
		sourceDeleted = false,
		copyable = true,
		onsubmit,
		onclose,
	}: Props = $props();

	const finder = createTaskFinder();
	let query = $state("");
	let target = $state<Task | null>(null);
	let keep = $state(false);
	let failure = $state<string | null>(null);
	let saving = $state(false);
	let wasOpen = false;

	const results = $derived(
		finder.found.filter((task) => task.id !== sourceTaskId).slice(0, 20),
	);
	const copying = $derived(keep && copyable);
	const keepLabel = $derived(
		sourceDeleted
			? "Keep the deleted original"
			: `Keep the original on ${sourceTaskId}`,
	);
	const actionLabel = $derived(
		target === null
			? copying
				? "Copy"
				: "Move"
			: `${copying ? "Copy" : "Move"} to ${target.id}`,
	);
	const outcome = $derived(
		copying
			? sourceDeleted
				? `${target?.id ?? ""} gets its own copy; the deleted original stays in Deleted attachments.`
				: `${target?.id ?? ""} gets its own copy; ${sourceTaskId} keeps the file.`
			: sourceDeleted
				? `The attachment moves to ${target?.id ?? ""} and leaves Deleted attachments.`
				: `The file leaves ${sourceTaskId}.`,
	);

	$effect(() => {
		if (open && !wasOpen) {
			wasOpen = true;
			query = "";
			target = null;
			keep = false;
			failure = null;
			finder.search("");
			return;
		}
		if (!open) wasOpen = false;
	});

	function type(value: string) {
		query = value;
		target = null;
		finder.search(value);
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (target === null) return;
		saving = true;
		failure = null;
		try {
			const problem = await onsubmit(target.id, copying);
			if (problem === null) {
				onclose();
			} else {
				failure = problem;
			}
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}
</script>

<Modal {open} title={copying ? "Copy attachment" : "Move attachment"} {onclose}>
	<form class="move" onsubmit={submit}>
		<p class="file" title={fileName}>{sourceTaskId} · {fileName}</p>

		<TextInput
			value={query}
			size="md"
			placeholder="Search tasks by id or title"
			aria-label="Target task"
			oninput={(event) => type(event.currentTarget.value)}
		/>

		{#if query.trim() === ""}
			<p class="hint">Type a task id or a part of its title.</p>
		{:else if results.length === 0}
			<p class="hint">No other task matches “{query.trim()}”.</p>
		{:else}
			<ul class="results">
				{#each results as task (task.id)}
					<li>
						<button
							type="button"
							class="result"
							class:is-picked={target?.id === task.id}
							aria-pressed={target?.id === task.id}
							onclick={() => (target = task)}
						>
							<span class="result-key">{task.id}</span>
							<span class="result-title" title={task.title}>{task.title}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if copyable}
			<label class="keep">
				<Checkbox bind:checked={keep} />
				{keepLabel}
			</label>
		{/if}

		{#if target !== null}
			<p class="hint">{outcome}</p>
		{/if}

		<ErrorNote message={failure} />

		<div class="actions">
			<Button
				variant="primary"
				type="submit"
				disabled={saving || target === null}
			>
				{saving ? "working…" : actionLabel}
			</Button>
			<Button type="button" onclick={onclose}>Cancel</Button>
		</div>
	</form>
</Modal>

<style>
	.move {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.file {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 14rem;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	.result {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.result:hover,
	.result:focus-visible {
		background: var(--hover);
	}

	.result.is-picked {
		background: color-mix(in oklch, var(--accent) 18%, transparent);
	}

	.result-key {
		flex: none;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.result-title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.keep {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.actions {
		display: flex;
		gap: var(--space-2);
	}

	:global(.actions .ui-button) {
		flex: 1;
		justify-content: center;
	}
</style>
