<script lang="ts">
	import InfoPopover from "#lib/components/ui/InfoPopover.svelte";
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import CircleHelp from "~icons/lucide/circle-help";
</script>

<span class="search-help">
	<InfoPopover label="Search syntax" hover={false}>
		{#snippet trigger({ open, toggle })}
			<IconButton
				label="Search syntax"
				size="sm"
				expanded={open}
				onclick={toggle}
			>
				<CircleHelp />
			</IconButton>
		{/snippet}
		{#snippet content()}
			<dl>
				<dt><code>=29</code></dt>
				<dd>exact task number, shown even when filters hide it</dd>
				<dt><code>=LOG-29</code></dt>
				<dd>exact task id</dd>
				<dt><code>129 130</code></dt>
				<dd>several queries at once, any match counts</dd>
				<dt><code>"add button"</code></dt>
				<dd>an exact phrase</dd>
				<dt><code>crash</code></dt>
				<dd>part of a title, description, id or epic</dd>
			</dl>
		{/snippet}
	</InfoPopover>
</span>

<style>
	.search-help {
		display: inline-flex;
	}

	.search-help :global(.info-popover-panel) {
		width: min(21rem, calc(100vw - 2rem));
		max-width: calc(100vw - 2rem);
		padding: var(--space-3) var(--space-4);
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2) var(--space-3);
		margin: 0;
	}

	dt {
		color: var(--foreground);
		white-space: nowrap;
	}

	dd {
		margin: 0;
	}

	code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	@media (max-width: 560px) {
		.search-help :global(.info-popover-panel) {
			width: calc(100vw - 2rem);
		}
	}
</style>
