<script lang="ts">
	import SingleSelect from "#lib/components/ui/select/SingleSelect.svelte";
	import TaskSelect from "#lib/components/ui/select/TaskSelect.svelte";
	import { STATUS_LABELS } from "#lib/tasks/display.ts";
	import {
		BLOCKED_REASON_MAX_LENGTH,
		STATUSES,
		type Status,
		type Task,
	} from "#lib/types.ts";

	interface Props {
		status: Status;
		blockedBy: string[];
		blockedReason: string;
		candidates: Task[];
		busy?: boolean;
		onstatus: (status: Status) => void;
		onadd: (id: string) => void;
		onremove: (id: string) => void;
		onreason: (reason: string | null) => void;
	}

	let {
		status,
		blockedBy,
		blockedReason,
		candidates,
		busy = false,
		onstatus,
		onadd,
		onremove,
		onreason,
	}: Props = $props();

	function changeReason(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const reason = input.value.trim();
		onreason(reason === "" ? null : reason);
	}

	const canMarkBlocked = $derived(
		blockedBy.length > 0 && status !== "blocked" && status !== "done",
	);
</script>

<div class="blocking">
	<div class="blocking-head">
		<span class="blocking-title">Blocking</span>
		{#if canMarkBlocked}
			<button
				type="button"
				class="blocking-hint"
				disabled={busy}
				onclick={() => onstatus("blocked")}
			>
				mark blocked
			</button>
		{/if}
	</div>
	<div class="detail-grid">
		<div class="field">
			Status
			<SingleSelect
				items={[...STATUSES]}
				value={status}
				getKey={(value) => value}
				getLabel={(value) => STATUS_LABELS[value]}
				onselect={(value) => onstatus(value)}
				variant="field"
				ariaLabel="Status"
				placeholder="Status"
			/>
		</div>
		<div class="field">
			Blocked by
			<TaskSelect
				items={candidates}
				value={blockedBy}
				{onadd}
				{onremove}
				placeholder="Add blocker"
				ariaLabel="Blocked by"
			/>
		</div>
		{#if status === "blocked"}
			<div class="field">
				Waiting for
				<input
					class="field-control"
					value={blockedReason}
					maxlength={BLOCKED_REASON_MAX_LENGTH}
					onchange={changeReason}
					placeholder="external blocker: release, answer, access"
					aria-label="Waiting for"
				/>
			</div>
		{/if}
	</div>
</div>

<style>
	.blocking {
		margin-bottom: var(--space-4);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--field);
	}

	.blocking-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.blocking-title {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.blocking-hint {
		border: 0;
		background: transparent;
		color: var(--accent-ink);
		font-family: inherit;
		font-size: var(--text-xs);
		cursor: pointer;
	}

	.blocking-hint:hover {
		color: var(--foreground);
	}

	.blocking-hint:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
