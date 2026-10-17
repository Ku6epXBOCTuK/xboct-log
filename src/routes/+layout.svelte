<script lang="ts">
	import "../app.css";
	import "../kanban.css";
	import UpdateBanner from "#lib/components/ui/UpdateBanner.svelte";
	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

{@render children()}

<UpdateBanner />
