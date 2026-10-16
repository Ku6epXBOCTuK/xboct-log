<script lang="ts">
	import "../app.css";
	import "../kanban.css";
	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

{@render children()}
