<script lang="ts">
	import ToggleChip from "@ku6epxboctuk/ui-kit/components/ToggleChip.svelte";
	import StatusDot from "#lib/components/ui/StatusDot.svelte";
	import { STATUS_LABELS } from "#lib/tasks/display.ts";
	import {
		ACTIVE_STATUSES,
		CLOSED_STATUSES,
		DEFAULT_STATUSES,
		STATUSES,
		type Status,
	} from "#lib/types.ts";

	interface Props {
		statuses: Status[];
		onpick: (status: Status) => void;
		onadd: (status: Status) => void;
		onpreset: (statuses: Status[]) => void;
	}

	let { statuses, onpick, onadd, onpreset }: Props = $props();

	const PRESETS: { label: string; statuses: readonly Status[] }[] = [
		{ label: "active", statuses: ACTIVE_STATUSES },
		{ label: "closed", statuses: CLOSED_STATUSES },
		{ label: "all", statuses: STATUSES },
	];

	const shown = $derived(new Set(statuses));

	function matches(value: readonly Status[]): boolean {
		return (
			value.length === statuses.length &&
			value.every((status) => shown.has(status))
		);
	}

	function handle(event: MouseEvent, status: Status) {
		if (event.ctrlKey || event.metaKey || event.shiftKey) {
			onadd(status);
			return;
		}
		onpick(status);
	}

	function titleFor(status: Status, on: boolean): string {
		const label = STATUS_LABELS[status];
		if (on) {
			if (statuses.length === 1) return "Back to the default statuses";
			return `Show only ${label} tasks · Ctrl-click to remove them`;
		}
		return `Show only ${label} tasks · Ctrl-click to add them`;
	}

	function applyPreset(value: readonly Status[], current: boolean) {
		onpreset(current ? [...DEFAULT_STATUSES] : [...value]);
	}
</script>

<div class="filter-group">
	<span class="filter-label">Status</span>
	{#each STATUSES as option (option)}
		{@const on = shown.has(option)}
		<ToggleChip
			active={on}
			onclick={(event) => handle(event, option)}
			title={titleFor(option, on)}
		>
			<StatusDot status={option} />
			{STATUS_LABELS[option]}
		</ToggleChip>
	{/each}
	<div class="filter-presets" role="group" aria-label="Status sets">
		{#each PRESETS as preset (preset.label)}
			{@const current = matches(preset.statuses)}
			<ToggleChip
				active={current}
				onclick={() => applyPreset(preset.statuses, current)}
				title={current
					? "Back to the default statuses"
					: `Show ${preset.label} tasks`}
			>
				{preset.label}
			</ToggleChip>
		{/each}
	</div>
</div>

<style>
	:global(.ui-toggle-chip:not([data-active])) :global(.status-dot) {
		background: transparent;
		box-shadow: inset 0 0 0 1px currentColor;
	}

	.filter-presets {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-left: var(--space-1);
	}
</style>
