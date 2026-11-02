<script lang="ts">
	import { page } from "$app/state";
	import ProjectSection from "#lib/components/projects/ProjectSection.svelte";
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton.svelte";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import ChevronDown from "~icons/lucide/chevron-down";
	import ChevronUp from "~icons/lucide/chevron-up";
	import PanelLeftClose from "~icons/lucide/panel-left-close";
	import PanelLeftOpen from "~icons/lucide/panel-left-open";
	import BackupControl from "./BackupControl.svelte";
	import BrandMark from "./BrandMark.svelte";
	import PrimaryNav from "./PrimaryNav.svelte";

	const { stats, ui } = useBoard();

	let navOpen = $state(false);

	const collapsed = $derived(ui.sidebarHidden);

	const standalonePage = $derived(
		page.url.pathname === "/backups" || page.url.pathname === "/tags",
	);

	function hide() {
		ui.setSidebarHidden(true);
	}

	function expand() {
		ui.setSidebarHidden(false);
	}
</script>

<aside class="sidebar" class:rail={collapsed}>
	<div class="sidebar-head">
		<BrandMark compact />
		<div class="sidebar-actions">
			<IconButton
				label={navOpen ? "Show only the current page" : "Show all pages"}
				expanded={navOpen}
				onclick={() => (navOpen = !navOpen)}
			>
				{#if navOpen}
					<ChevronUp />
				{:else}
					<ChevronDown />
				{/if}
			</IconButton>
			{#if !collapsed}
				<IconButton
					label="Hide navigation"
					title="Hide navigation"
					onclick={hide}
				>
					<PanelLeftClose />
				</IconButton>
			{/if}
		</div>
	</div>
	{#if collapsed}
		<div class="sidebar-expand">
			<IconButton
				label="Show navigation"
				title="Show navigation"
				onclick={expand}
			>
				<PanelLeftOpen />
			</IconButton>
		</div>
	{/if}
	<PrimaryNav
		taskCount={stats.activeTasks}
		inProgressCount={stats.inProgress}
		onlyActive={!navOpen}
	/>
	{#if !standalonePage}
		<div class="sidebar-scroll">
			<ProjectSection />
		</div>
	{/if}
	<BackupControl />
</aside>

<style>
	.sidebar {
		width: var(--sidebar-w);
		min-width: var(--sidebar-w);
		display: flex;
		flex-direction: column;
		padding: var(--edge-pad) var(--space-3) var(--edge-pad);
		border-right: 1px solid var(--border);
		background: var(--surface);
		overflow: hidden;
		container-type: inline-size;
		container-name: sidebar;
	}

	.sidebar-scroll {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.sidebar-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.sidebar-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.sidebar-expand {
		display: flex;
		justify-content: center;
	}

	@media (max-width: 820px) {
		.sidebar {
			padding-inline: var(--space-2);
		}

		.sidebar-expand {
			display: none;
		}
	}

	.sidebar.rail {
		padding-inline: var(--space-2);
	}

	@container sidebar (max-width: 6rem) {
		.sidebar-head {
			justify-content: center;
			margin-bottom: var(--space-1);
		}

		.sidebar-actions {
			display: none;
		}

		.sidebar-expand {
			margin-bottom: var(--space-1);
		}

		.sidebar-expand > :global(.ui-icon-button) {
			width: 100%;
			height: auto;
			aspect-ratio: 1;
			border-radius: var(--radius);
		}

		.sidebar-expand :global(svg) {
			width: 1.125rem;
			height: 1.125rem;
		}
	}
</style>
