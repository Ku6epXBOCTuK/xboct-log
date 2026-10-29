<script lang="ts">
	import InfoPopover from "#lib/components/ui/InfoPopover.svelte";
	import type { CountGroups } from "#lib/tasks/counts.ts";
	import type { Snippet } from "svelte";

	interface Props {
		active: boolean;
		selection?: boolean;
		counts: CountGroups;
		onselect: () => void;
		children: Snippet;
	}

	let {
		active,
		selection = false,
		counts,
		onselect,
		children,
	}: Props = $props();

	const stats = $derived([
		["backlog", counts.backlog],
		["active", counts.active],
		["blocked", counts.blocked],
		["complete", counts.complete],
	] as const);
</script>

<button
	class={`project-item ${active ? "selected" : ""} ${selection ? "has-selection" : ""}`}
	aria-pressed={active}
	title={selection ? "Contains the selected task" : undefined}
	onclick={onselect}
>
	<span class="project-mark"></span>
	<span class="project-name">
		{@render children()}
	</span>
	<span class="project-count-wrap">
		<InfoPopover label="Project statistics">
			{#snippet trigger({ open })}
				<span
					class="project-count"
					class:zero={counts.active === 0}
					aria-expanded={open}
				>
					{counts.active}
				</span>
			{/snippet}
			{#snippet content()}
				<dl class="project-stats">
					{#each stats as [label, value] (label)}
						<dt>{label}</dt>
						<dd>{value}</dd>
					{/each}
				</dl>
			{/snippet}
		</InfoPopover>
	</span>
</button>

<style>
	.project-item {
		border: 0;
		background: transparent;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1 1 auto;
		min-width: 0;
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

	.project-item.has-selection {
		color: var(--foreground);
		background: var(--violet-row);
		box-shadow: inset 2px 0 var(--violet);
		border-top-left-radius: 0;
		border-bottom-left-radius: 0;
	}

	.project-item.has-selection .project-mark {
		border-color: var(--violet);
	}

	.project-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
		padding-right: var(--project-actions-w, 0);
	}

	.project-mark {
		width: 0.875rem;
		height: 0.875rem;
		border-radius: 50%;
		border: 1px solid var(--border-strong);
		flex: none;
		display: grid;
		place-items: center;
	}

	.project-item:hover .project-mark {
		border-color: var(--text-muted);
	}

	.project-item.selected .project-mark {
		border-color: var(--accent);
	}

	.project-item.selected .project-mark::after {
		content: "";
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--accent);
	}

	.project-count-wrap {
		margin-left: auto;
		display: inline-flex;
		flex: none;
	}

	.project-count {
		min-width: var(--project-count-w, 1.75rem);
		color: var(--foreground);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		text-align: right;
		cursor: help;
	}

	.project-count.zero {
		color: var(--text-muted);
		opacity: 0.55;
	}

	.project-stats {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0 var(--space-4);
		margin: 0;
		font-variant-numeric: tabular-nums;
	}

	.project-stats dt {
		color: var(--text-muted);
	}

	.project-stats dd {
		margin: 0;
		color: var(--foreground);
		text-align: right;
	}
</style>
