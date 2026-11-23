<script lang="ts">
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton.svelte";
	import ProjectSection from "#lib/components/projects/ProjectSection.svelte";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { page } from "$app/state";
	import ChevronDown from "~icons/lucide/chevron-down";
	import ChevronUp from "~icons/lucide/chevron-up";
	import BackupControl from "./BackupControl.svelte";
	import BrandMark from "./BrandMark.svelte";
	import PrimaryNav from "./PrimaryNav.svelte";

	const { stats, ui } = useBoard();

	const standalonePage = $derived(
		page.url.pathname === "/backups" || page.url.pathname === "/tags",
	);
</script>

<aside class="sidebar">
	<div class="sidebar-head">
		<BrandMark compact />
		<div class="sidebar-actions">
			<IconButton
				label={ui.navCollapsed ? "Show all pages" : "Show pinned pages"}
				expanded={!ui.navCollapsed}
				data-testid="nav-mode-toggle"
				onclick={() => ui.setNavCollapsed(!ui.navCollapsed)}
			>
				{#if ui.navCollapsed}
					<ChevronDown />
				{:else}
					<ChevronUp />
				{/if}
			</IconButton>
		</div>
	</div>
	<PrimaryNav
		taskCount={stats.activeTasks}
		inProgressCount={stats.inProgress}
		collapsed={ui.navCollapsed}
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

	@media (max-width: 820px) {
		.sidebar {
			padding-inline: var(--space-2);
		}
	}
</style>
