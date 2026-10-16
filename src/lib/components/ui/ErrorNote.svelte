<script lang="ts">
	interface Props {
		message: string | null;
		class?: string;
	}

	let { message, class: className = "detail-error" }: Props = $props();
</script>

{#if message !== null}
	<p class={className}>{message}</p>
{/if}
