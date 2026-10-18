<script lang="ts">
	import IconButton from "#lib/components/ui/IconButton.svelte";
	import Moon from "~icons/lucide/moon";
	import PanelLeftClose from "~icons/lucide/panel-left-close";
	import Plus from "~icons/lucide/plus";
	import Sun from "~icons/lucide/sun";

	interface Props {
		appearance: "light" | "dark";
		ontoggle: () => void;
		onnew: () => void;
		projectName?: string;
	}

	let { appearance, ontoggle, onnew, projectName }: Props = $props();
</script>

<div class="title-row">
	<h1>{projectName ?? "Projects"}</h1>
	<div class="header-actions">
		<IconButton
			label={appearance === "light"
				? "Switch to dark theme"
				: "Switch to light theme"}
			size="md"
			onclick={ontoggle}
		>
			{#if appearance === "light"}
				<Moon />
			{:else}
				<Sun />
			{/if}
		</IconButton>
		<IconButton label="Collapse sidebar" size="md">
			<PanelLeftClose />
		</IconButton>
		<button class="new-task" onclick={onnew}>
			<Plus data-icon="inline-start" /> New task
		</button>
	</div>
</div>

<style>
	.title-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-4);
		margin-bottom: var(--space-5);
	}

	.title-row h1 {
		margin: 0;
		font-size: var(--text-2xl);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.header-actions {
		display: flex;
		gap: var(--space-2);
	}

	@media (max-width: 560px) {
		.title-row h1 {
			font-size: var(--text-xl);
		}

		.header-actions :global(.icon-btn) {
			display: none;
		}
	}
</style>
