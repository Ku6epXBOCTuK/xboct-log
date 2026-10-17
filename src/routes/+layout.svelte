<script lang="ts">
	import { onMount } from "svelte";
	import "../app.css";
	import "../kanban.css";
	import UpdateBanner from "#lib/components/ui/UpdateBanner.svelte";
	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();

	onMount(() => {
		function handleKeydown(event: KeyboardEvent) {
			if (event.ctrlKey && event.key === "Tab") {
				event.preventDefault();
				window.parent.postMessage(
					{
						type: event.shiftKey ? "xboct-log:prev-tab" : "xboct-log:next-tab",
					},
					"*",
				);
			}
		}
		window.addEventListener("keydown", handleKeydown);
		return () => window.removeEventListener("keydown", handleKeydown);
	});
</script>

{@render children()}

<UpdateBanner />
