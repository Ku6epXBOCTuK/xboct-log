<script lang="ts">
	import { onMount } from "svelte";
	import { fetchFresh } from "#lib/api/fresh.ts";
	import { listBackupFiles } from "#lib/api/workspace/backups.ts";
	import BackupList from "#lib/components/backups/BackupList.svelte";
	import RestoreNotice from "#lib/components/backups/RestoreNotice.svelte";
	import AppBar from "#lib/components/layout/AppBar.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import { data } from "#lib/data/data.svelte.ts";
	import { reloadApp } from "#lib/reload.ts";
	import { messageOf } from "#lib/tasks/presentation/display.ts";
	import type { BackupItem, RestoreOutcome } from "#lib/types.ts";

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
			await data.load(
				"backups",
				() => fetchFresh(listBackupFiles({})),
				(value) => {
					items = value.items;
				},
				true,
			);
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
	<AppBar>
		{#snippet leading()}
			<h1>Backups</h1>
			<span class="muted"> {items.length} snapshots on disk </span>
		{/snippet}
	</AppBar>

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
