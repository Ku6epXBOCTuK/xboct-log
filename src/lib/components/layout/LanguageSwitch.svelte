<div class="language-switch">
	<button>RU</button>
	<button class="active">EN</button>
</div>

<style>
	.language-switch {
		display: flex;
		margin-top: auto;
		border: 1px solid var(--border);
		padding: var(--space-1);
		border-radius: var(--radius);
		width: max-content;
	}

	.language-switch button {
		border: 0;
		background: transparent;
		color: var(--text-muted);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
	}

	.language-switch button:hover {
		color: var(--foreground);
	}

	.language-switch button.active {
		background: var(--selected);
		color: var(--foreground);
	}

	@media (max-width: 820px) {
		.language-switch {
			display: none;
		}
	}
</style>
