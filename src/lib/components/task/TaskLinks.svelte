<script lang="ts">
	import TaskSelect from "#lib/components/ui/select/TaskSelect.svelte";
	import type { Task } from "#lib/types.ts";

	type LinkField = "relates_to" | "duplicates" | "duplicated_by";

	interface Props {
		relatesTo: string[];
		duplicates: string[];
		duplicatedBy: string[];
		candidates: Task[];
		onadd: (field: LinkField, id: string) => void;
		onremove: (field: LinkField, id: string) => void;
	}

	let {
		relatesTo,
		duplicates,
		duplicatedBy,
		candidates,
		onadd,
		onremove,
	}: Props = $props();
</script>

<div class="links">
	<span class="links-title">Links</span>
	<div class="detail-grid">
		<div class="field field-wide">
			Relates to
			<TaskSelect
				items={candidates}
				value={relatesTo}
				onadd={(id) => onadd("relates_to", id)}
				onremove={(id) => onremove("relates_to", id)}
				placeholder="Add related task"
				ariaLabel="Relates to"
			/>
		</div>
		<div class="field">
			Duplicates
			<TaskSelect
				items={candidates}
				value={duplicates}
				onadd={(id) => onadd("duplicates", id)}
				onremove={(id) => onremove("duplicates", id)}
				placeholder="Add duplicate of"
				ariaLabel="Duplicates"
			/>
		</div>
		<div class="field">
			Duplicated by
			<TaskSelect
				items={candidates}
				value={duplicatedBy}
				onadd={(id) => onadd("duplicated_by", id)}
				onremove={(id) => onremove("duplicated_by", id)}
				placeholder="Add duplicate source"
				ariaLabel="Duplicated by"
			/>
		</div>
	</div>
</div>

<style>
	.links {
		margin-bottom: var(--space-4);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--field);
	}

	.field-wide {
		grid-column: 1 / -1;
	}

	.links-title {
		display: block;
		margin-bottom: var(--space-3);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
</style>
