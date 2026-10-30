<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { ErrorProps } from "./$types";

	let { error }: ErrorProps = $props();

	const missing = $derived(page.status === 404);
</script>

<div class="error-page">
	<div class="error-card">
		<p class="error-code">{page.status}</p>
		<h1 class="error-title">
			{missing ? "Страница не найдена" : "Что-то пошло не так"}
		</h1>
		<p class="error-text">
			{missing
				? "Такой страницы нет. Возможно, ссылка устарела или в адресе опечатка."
				: error.message}
		</p>
		<p class="error-path">{page.url.pathname}</p>
		<div class="error-actions">
			<a class="error-link primary" href={resolve("/")}>На главную</a>
			<a class="error-link" href={resolve("/kanban")}>Канбан</a>
		</div>
	</div>
</div>

<style>
	.error-page {
		flex: 1 1 auto;
		min-width: 0;
		display: grid;
		place-items: center;
		padding: var(--edge-pad);
		overflow: auto;
	}

	.error-card {
		display: grid;
		gap: var(--space-3);
		width: 100%;
		max-width: 30rem;
		padding: var(--space-6);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel);
	}

	.error-code {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xl);
		font-weight: 500;
		line-height: 1;
		letter-spacing: 0.08em;
		color: var(--accent);
	}

	.error-title {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.2;
		color: var(--foreground);
	}

	.error-text {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.error-path {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius);
		background: var(--field);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}

	.error-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.error-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: var(--control-h);
		padding: 0 var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--panel);
		color: var(--foreground);
		font-size: var(--text-sm);
		font-weight: 500;
		text-decoration: none;
		transition: border-color 0.15s ease;
	}

	.error-link:hover {
		border-color: var(--border-strong);
	}

	.error-link:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}

	.error-link.primary {
		border-color: transparent;
		background: var(--accent);
		color: var(--on-accent);
	}

	.error-link.primary:hover {
		background: var(--ui-accent-hover);
	}

	@media (prefers-reduced-motion: reduce) {
		.error-link {
			transition: none;
		}
	}
</style>
