<script lang="ts">
	import { INBOX_PROJECT_ID, type Project } from "#lib/types.ts";
	import Check from "~icons/lucide/check";
	import Pencil from "~icons/lucide/pencil";
	import Trash2 from "~icons/lucide/trash-2";

	interface Props {
		project: Project;
		active: boolean;
		count: number;
		onselect: () => void;
		onrename: (name: string) => void;
		onarchive: () => void;
	}

	let { project, active, count, onselect, onrename, onarchive }: Props =
		$props();

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
