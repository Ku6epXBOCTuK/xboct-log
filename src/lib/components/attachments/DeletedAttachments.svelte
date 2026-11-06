<script lang="ts">
	import IconButton from "@ku6epxboctuk/ui-kit/components/IconButton.svelte";
	import ErrorNote from "#lib/components/ui/ErrorNote.svelte";
	import ImageViewer from "#lib/components/ui/ImageViewer.svelte";
	import MoveAttachmentDialog from "#lib/components/attachments/MoveAttachmentDialog.svelte";
	import { openExternal } from "#lib/host/embed.ts";
	import {
		copyTaskAttachment,
		getDeletedAttachments,
		moveTaskAttachment,
		purgeTaskAttachment,
		restoreTaskAttachment,
	} from "#lib/remote/attachments.remote.ts";
	import { fetchFresh } from "#lib/remote/fresh.ts";
	import { useBoard } from "#lib/state/board.svelte.ts";
	import { formatSize, isImage } from "#lib/tasks/attachments.ts";
	import { formatDate, messageOf } from "#lib/tasks/display.ts";
	import type { DeletedAttachment } from "#lib/types.ts";
	import { resolve } from "$app/paths";
	import ArchiveRestore from "~icons/lucide/archive-restore";
	import ArrowRightLeft from "~icons/lucide/arrow-right-left";
	import Paperclip from "~icons/lucide/paperclip";
	import Trash2 from "~icons/lucide/trash-2";

	const { fresh } = useBoard();

	let items = $state<DeletedAttachment[]>([]);
	let loaded = $state(false);
	let failed = $state(false);
	let error = $state("");
	let busy = $state("");
	let viewing = $state<DeletedAttachment>();
	let moving = $state<DeletedAttachment>();
	let done = $state<Record<string, "restored" | "purged" | "moved" | "copied">>(
		{},
	);
	let doneTo = $state<Record<string, string>>({});

	function fileUrl(item: DeletedAttachment): string {
		return resolve("/deleted/media/[id]", { id: item.id });
	}

	function open(item: DeletedAttachment) {
		if (item.missing || done[item.id] !== undefined) return;
		if (isImage(item.mime_type)) {
			viewing = item;
			return;
		}
		openExternal(new URL(fileUrl(item), location.href).href);
	}

	function deletedLabel(value: string | null): string {
		if (value === null) return "";
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return "";
		const time = date.toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		return `${formatDate(value)} ${time}`;
	}

	async function load() {
		try {
			const result = await fetchFresh(getDeletedAttachments({}));
			items = result.items;
			failed = false;
		} catch {
			failed = true;
		} finally {
			loaded = true;
		}
	}

	$effect(() => {
		void load();
	});

	$effect(() => fresh.register("tasks", () => void load()));

	async function restore(id: string) {
		error = "";
		busy = id;
		try {
			await restoreTaskAttachment({ attachment_id: id });
			done = { ...done, [id]: "restored" };
		} catch (cause) {
			error = messageOf(cause);
		} finally {
			busy = "";
		}
	}

	async function purge(id: string) {
		error = "";
		busy = id;
		try {
			await purgeTaskAttachment({ attachment_id: id });
			done = { ...done, [id]: "purged" };
		} catch (cause) {
			error = messageOf(cause);
		} finally {
			busy = "";
		}
	}

	async function moveTo(target: string, copy: boolean): Promise<string | null> {
		const item = moving;
		if (item === undefined) return "no attachment chosen";
		error = "";
		busy = item.id;
		try {
			if (copy) {
				await copyTaskAttachment({ attachment_id: item.id, task_id: target });
				done = { ...done, [item.id]: "copied" };
			} else {
				await moveTaskAttachment({ attachment_id: item.id, task_id: target });
				done = { ...done, [item.id]: "moved" };
			}
			doneTo = { ...doneTo, [item.id]: target };
			return null;
		} catch (cause) {
			return messageOf(cause);
		} finally {
			busy = "";
		}
	}
</script>

{#if error !== ""}
	<div class="error-wrap">
		<ErrorNote message={error} />
	</div>
{/if}

{#if failed}
	<p class="empty">Deleted attachments are unavailable</p>
{:else if !loaded}
	<p class="empty">Loading…</p>
{:else if items.length === 0}
	<p class="empty">No deleted attachments</p>
{:else}
	<ul class="list">
		{#each items as item (item.id)}
			<li class="row" class:done={done[item.id] !== undefined}>
				{#if item.missing}
					<span
						class="thumb is-missing"
						title="The file is gone from the media folder"
					>
						<Paperclip />
					</span>
				{:else}
					<button
						type="button"
						class="thumb"
						title={isImage(item.mime_type)
							? "View the attachment"
							: "Open the attachment"}
						disabled={done[item.id] !== undefined}
						onclick={() => open(item)}
					>
						{#if isImage(item.mime_type)}
							<img src={fileUrl(item)} alt={item.file_name} loading="lazy" />
						{:else}
							<Paperclip />
						{/if}
					</button>
				{/if}
				<span class="body">
					<span class="name" title={item.file_name}>{item.file_name}</span>
					<span class="meta" title={`${item.size} bytes`}>
						<span class="task">{item.task_id}</span>
						{#if item.task_title !== null}
							<span class="sep">·</span>
							<span class="title" title={item.task_title}
								>{item.task_title}</span
							>
						{/if}
						<span class="sep">·</span>
						<span>{formatSize(item.size)}</span>
						{#if item.deleted_at !== null}
							<span class="sep">·</span>
							<span>deleted {deletedLabel(item.deleted_at)}</span>
						{/if}
						{#if item.missing}
							<span class="sep">·</span>
							<span class="gone">the file is gone from the media folder</span>
						{/if}
					</span>
				</span>
				<span class="actions">
					{#if done[item.id] === "restored"}
						<span class="state">Restored</span>
					{:else if done[item.id] === "purged"}
						<span class="state">Removed</span>
					{:else if done[item.id] === "moved"}
						<span class="state">Moved to {doneTo[item.id]}</span>
					{:else if done[item.id] === "copied"}
						<span class="state">Copied to {doneTo[item.id]}</span>
					{:else}
						<IconButton
							label="Move to another task"
							title="Move to another task"
							disabled={busy !== ""}
							onclick={() => (moving = item)}
						>
							<ArrowRightLeft />
						</IconButton>
						<IconButton
							label="Restore attachment"
							title={item.missing
								? "The file is gone from the media folder"
								: "Restore attachment"}
							disabled={busy !== "" || item.missing}
							onclick={() => void restore(item.id)}
						>
							<ArchiveRestore />
						</IconButton>
						<IconButton
							label="Delete forever"
							title="Delete forever"
							disabled={busy !== ""}
							onclick={() => void purge(item.id)}
						>
							<Trash2 />
						</IconButton>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
	{#if viewing !== undefined}
		<ImageViewer
			src={fileUrl(viewing)}
			alt={viewing.file_name}
			title={viewing.file_name}
			onclose={() => (viewing = undefined)}
		/>
	{/if}
{/if}

<MoveAttachmentDialog
	open={moving !== undefined}
	fileName={moving?.file_name ?? ""}
	sourceTaskId={moving?.task_id ?? ""}
	sourceDeleted={true}
	copyable={moving !== undefined && !moving.missing}
	onsubmit={moveTo}
	onclose={() => (moving = undefined)}
/>

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0 var(--edge-pad);
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		width: 100%;
		max-width: 44rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-md);
	}

	.thumb {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		flex: none;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--field);
		color: var(--text-muted);
		cursor: pointer;
		overflow: hidden;
	}

	.thumb.is-missing {
		border: 1px dashed var(--border);
		background: transparent;
		cursor: default;
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.thumb :global(svg) {
		width: 1rem;
		height: 1rem;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1 1 auto;
	}

	.name {
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		display: flex;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		overflow: hidden;
	}

	.meta .task {
		flex: 0 0 auto;
		color: var(--text-secondary);
	}

	.meta .sep {
		flex: 0 0 auto;
	}

	.meta .title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta .gone {
		color: var(--accent-ink);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row.done {
		opacity: 0.55;
	}

	.state {
		color: var(--text-muted);
		font-size: var(--text-sm);
		padding: 0 var(--space-2);
	}

	.thumb:disabled {
		cursor: default;
	}

	.actions {
		display: flex;
		flex: none;
		gap: var(--space-1);
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
