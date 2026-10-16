<div class="brand">
	<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
		<rect
			class="brand-mark-accent"
			x="3"
			y="5"
			width="18"
			height="3.5"
			rx="1.75"
		/>
		<rect x="3" y="10.25" width="13" height="3.5" rx="1.75" />
		<rect x="3" y="15.5" width="9" height="3.5" rx="1.75" />
	</svg>
	<span class="brand-word"
		>xboct<span class="brand-word-accent">-log</span></span
	>
</div>

<style>
	.brand {
		padding: var(--space-1) var(--space-3) var(--space-6);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-brand);
		line-height: 1;
		font-weight: 700;
		letter-spacing: -0.04em;
		color: var(--foreground);
	}

	.brand-mark {
		width: 1.375rem;
		height: 1.375rem;
		flex: none;
		fill: currentColor;
	}

	.brand-mark-accent {
		fill: var(--accent);
	}

	.brand-word-accent {
		color: var(--accent);
	}

	@media (max-width: 820px) {
		.brand {
			padding-inline: var(--space-2);
			justify-content: center;
		}

		.brand-word {
			display: none;
		}
	}
</style>
