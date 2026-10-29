<script lang="ts">
	import BackupList from "#lib/components/backups/BackupList.svelte";
	import RestoreNotice from "#lib/components/backups/RestoreNotice.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import { listBackupFiles } from "#lib/remote/backup.remote.ts";
	import type { BackupItem, RestoreOutcome } from "#lib/remote/contracts.ts";
	import { fetchFresh } from "#lib/remote/fresh.ts";
	import { reloadApp } from "#lib/reload.ts";
	import { messageOf } from "#lib/tasks/display.ts";
	import { onMount } from "svelte";

	const RESTORE_RESULT_KEY = "xboct-log:restore-result";

	let items = $state<BackupItem[]>([]);
	let loaded = $state(false);
	let error = $state("");
	let result = $state<RestoreOutcome | null>(null);

	onMount(() => {
		const raw = sessionStorage.getItem(RESTORE_RESULT_KEY);
		if (raw === null) return;
		sessionStorage.removeItem(RESTORE_RESULT_KEY);
		try {
			result = JSON.parse(raw) as RestoreOutcome;
		} catch {
			result = null;
		}
	});

	async function load() {
		error = "";
		try {
			const value = await fetchFresh(listBackupFiles({}));
			items = value.items;
		} catch (cause) {
			error = messageOf(cause);
		} finally {
			loaded = true;
		}
	}

	$effect(() => {
		void load();
	});

	function restored(outcome: RestoreOutcome) {
		sessionStorage.setItem(RESTORE_RESULT_KEY, JSON.stringify(outcome));
		reloadApp();
	}
</script>

<section class="backups-page">
	<header class="page-head">
		<h1>Backups</h1>
		<span class="muted"> {items.length} snapshots on disk </span>
	</header>

	{#if result !== null}
		<RestoreNotice outcome={result} ondismiss={() => (result = null)} />
	{/if}

	{#if error !== ""}
		<div class="error-wrap">
			<ErrorNote message={error} />
		</div>
	{/if}

	{#if !loaded}
		<p class="empty">Loading…</p>
	{:else if items.length === 0}
		<p class="empty">
			No backups yet. The launcher writes one every day and before each MCP
			write.
		</p>
	{:else}
		<BackupList
			{items}
			onrestored={restored}
			onerror={(text) => (error = text)}
		/>
	{/if}
</section>

<style>
	.backups-page {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: auto;
		background: var(--background);
	}

	.page-head {
		flex: none;
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--edge-pad) var(--edge-pad) var(--space-3);
	}

	.page-head h1 {
		margin: 0;
		font-size: var(--text-2xl);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
	}

	.error-wrap {
		margin: 0 var(--edge-pad) var(--space-3);
	}

	.empty {
		margin: 0;
		padding: var(--space-8) var(--edge-pad);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
