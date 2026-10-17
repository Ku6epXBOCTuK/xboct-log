<script lang="ts">
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import { INBOX_PROJECT_ID, type Project } from "#lib/types.ts";
	import Settings from "~icons/lucide/settings";
	import Trash2 from "~icons/lucide/trash-2";
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
			<Trash2 />
		</IconButton>
	{/if}
</div>

<style>
	.project-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
</style>
