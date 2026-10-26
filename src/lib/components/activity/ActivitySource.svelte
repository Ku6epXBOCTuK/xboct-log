<script lang="ts">
	interface Props {
		source: string;
		client: string | null;
	}

	let { source, client }: Props = $props();
</script>

<span class="source" data-source={source}>{source}</span>
{#if client !== null}
	<span class="client">{client}</span>
{/if}

<style>
	.source {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}

	.source[data-source="mcp"] {
		border-color: var(--accent);
		color: var(--accent-ink);
	}

	.source[data-source="ui"] {
		color: var(--text-muted);
	}

	.client {
		display: block;
		margin-top: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
</style>
