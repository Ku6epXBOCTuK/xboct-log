<script lang="ts">
	import Moon from "~icons/lucide/moon";
	import PanelLeftClose from "~icons/lucide/panel-left-close";
	import Plus from "~icons/lucide/plus";
	import Sun from "~icons/lucide/sun";

	interface Props {
		appearance: "light" | "dark";
		ontoggle: () => void;
		onnew: () => void;
	}

	let { appearance, ontoggle, onnew }: Props = $props();
</script>

<div class="title-row">
	<h1>Projects</h1>
	<div class="header-actions">
		<button
			class="icon-button"
			onclick={ontoggle}
			aria-label={appearance === "light"
				? "Switch to dark theme"
				: "Switch to light theme"}
		>
			{#if appearance === "light"}
				<Moon />
			{:else}
				<Sun />
			{/if}
		</button>
		<button class="icon-button" aria-label="Collapse sidebar">
			<PanelLeftClose />
		</button>
		<button class="new-task" onclick={onnew}>
			<Plus data-icon="inline-start" /> New task
		</button>
	</div>
</div>
