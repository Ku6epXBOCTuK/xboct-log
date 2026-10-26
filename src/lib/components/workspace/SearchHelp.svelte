<script lang="ts">
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import CircleHelp from "~icons/lucide/circle-help";

	let open = $state(false);
	let root = $state<HTMLDivElement | null>(null);

	function toggle() {
		open = !open;
	}

	$effect(() => {
		if (!open) return;

		function onPointerDown(event: PointerEvent) {
			if (root !== null && !root.contains(event.target as Node)) open = false;
		}

		function onKeydown(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			open = false;
		}

		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeydown);

		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeydown);
		};
	});
</script>

<div class="search-help" bind:this={root}>
	<IconButton label="Search syntax" size="sm" expanded={open} onclick={toggle}>
		<CircleHelp />
	</IconButton>
	{#if open}
		<div class="help-panel" role="note">
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
		</div>
	{/if}
</div>

<style>
	.search-help {
		display: inline-flex;
	}

	.help-panel {
		position: absolute;
		top: calc(100% + var(--space-2));
		left: 0;
		z-index: 20;
		width: min(21rem, calc(100vw - 2rem));
		padding: var(--space-3) var(--space-4);
		background: var(--field);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		box-shadow: 0 0.75rem 1.75rem rgb(0 0 0 / 0.18);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		line-height: 1.45;
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
		.help-panel {
			width: calc(100vw - 2rem);
		}
	}
</style>
