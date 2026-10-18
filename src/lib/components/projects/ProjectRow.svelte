<script lang="ts">
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import { INBOX_PROJECT_ID, type Project } from "#lib/types.ts";
	import Settings from "~icons/lucide/settings";
	import Trash from "~icons/lucide/trash";
	import TrashOff from "~icons/lucide/trash-off";
	import ProjectItem from "./ProjectItem.svelte";

	interface Props {
		project: Project;
		active: boolean;
		count: number;
		onselect: () => void;
		onarchive: () => void;
		onsettings: () => void;
	}

	let { project, active, count, onselect, onarchive, onsettings }: Props =
		$props();
</script>

<div class="project-row">
	<ProjectItem {active} {count} {onselect}>
		{project.name}
	</ProjectItem>
	<div class="project-actions">
		<IconButton label={`Settings for ${project.name}`} onclick={onsettings}>
			<Settings />
		</IconButton>
		{#if project.id !== INBOX_PROJECT_ID}
			<IconButton
				label={project.archived_at === null
					? `Archive ${project.name}`
					: `Restore ${project.name}`}
				onclick={onarchive}
			>
				{#if project.archived_at === null}
					<Trash />
				{:else}
					<TrashOff />
				{/if}
			</IconButton>
		{/if}
	</div>
</div>

<style>
	.project-row {
		--project-count-w: 1.75rem;
		--project-actions-w: 4.25rem;
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.project-actions {
		position: absolute;
		top: 50%;
		right: calc(var(--project-count-w) + var(--space-2));
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		gap: var(--space-1);
		opacity: 0;
		transition: opacity 0.12s ease-out;
	}

	.project-row:hover .project-actions,
	.project-row:focus-within .project-actions {
		opacity: 1;
	}

	@media (hover: none) {
		.project-actions {
			opacity: 1;
		}
	}
</style>
