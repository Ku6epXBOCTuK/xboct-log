<script lang="ts">
	import { INBOX_PROJECT_ID, type Project } from "#lib/types.ts";
	import Check from "~icons/lucide/check";
	import Pencil from "~icons/lucide/pencil";
	import Settings from "~icons/lucide/settings";
	import Trash2 from "~icons/lucide/trash-2";

	interface Props {
		project: Project;
		active: boolean;
		count: number;
		onselect: () => void;
		onrename: (name: string) => void;
		onarchive: () => void;
		onsettings: () => void;
	}

	let {
		project,
		active,
		count,
		onselect,
		onrename,
		onarchive,
		onsettings,
	}: Props = $props();

	let editing = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (editing) input?.focus();
	});

	function commit(event: Event) {
		if (!editing) return;

		const name = (event.currentTarget as HTMLInputElement).value.trim();
		editing = false;

		if (name === "" || name === project.name) return;
		onrename(name);
	}
</script>

{#if editing}
	<div class="project-row">
		<input
			class="project-rename"
			value={project.name}
			aria-label={`Rename ${project.name}`}
			bind:this={input}
			onchange={commit}
			onblur={commit}
		/>
	</div>
{:else}
	<div class={`project-row ${active ? "selected" : ""}`}>
		<button class="project-item" onclick={onselect}>
			<span class="project-check">
				<Check />
			</span>
			<span>{project.name}</span>
			<span class="project-count">{count}</span>
		</button>
		<button
			class="project-icon"
			type="button"
			onclick={onsettings}
			aria-label={`Settings for ${project.name}`}
		>
			<Settings />
		</button>
		<button
			class="project-icon"
			type="button"
			onclick={() => (editing = true)}
			aria-label={`Rename ${project.name}`}
		>
			<Pencil />
		</button>
		{#if project.id !== INBOX_PROJECT_ID}
			<button
				class="project-icon"
				type="button"
				onclick={onarchive}
				aria-label={project.archived_at === null
					? `Archive ${project.name}`
					: `Restore ${project.name}`}
			>
				<Trash2 class="delete-icon" />
			</button>
		{/if}
	</div>
{/if}

<style>
	.project-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.project-row .project-item {
		flex: 1;
		min-width: 0;
	}

	.project-row.selected .project-item {
		color: var(--foreground);
	}

	.project-item {
		border: 0;
		background: transparent;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2);
		text-align: left;
		font-size: var(--text-sm);
		border-radius: var(--radius-sm);
	}

	.project-item:hover,
	.project-item.selected {
		color: var(--foreground);
	}

	.project-item:hover {
		background: var(--hover);
	}

	.project-item > span:not(.project-check):not(.project-count) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.project-check {
		width: 1rem;
		height: 1rem;
		display: grid;
		place-items: center;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--on-accent);
		flex: none;
	}

	.project-check :global(svg) {
		width: 0.75rem;
		height: 0.75rem;
		stroke-width: 3;
	}

	.project-count {
		margin-left: auto;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.project-icon {
		border: 0;
		background: transparent;
		color: var(--text-muted);
		border-radius: var(--radius-sm);
		width: var(--control-h-sm);
		height: var(--control-h-sm);
		flex: none;
		display: grid;
		place-items: center;
	}

	.project-icon:hover {
		color: var(--foreground);
		background: var(--hover);
	}

	.project-icon :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.project-rename {
		width: 100%;
		border: 1px solid var(--border-strong);
		background: var(--field);
		color: var(--foreground);
		border-radius: var(--radius);
		padding: var(--space-2) var(--space-3);
		min-height: var(--control-h);
		outline: none;
		font-size: var(--text-md);
	}

	.project-rename:focus {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
</style>
