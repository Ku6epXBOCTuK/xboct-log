import {
	addTaskAttachment,
	getTaskAttachments,
	removeTaskAttachment,
} from "#lib/remote/attachments.remote.ts";
import { fetchFresh } from "#lib/remote/fresh.ts";
import { createAttachmentFlash } from "#lib/state/attachment-flash.svelte.ts";
import type { TaskStore } from "#lib/state/tasks.svelte.ts";
import { fileToBase64 } from "#lib/tasks/attachments.ts";
import { messageOf } from "#lib/tasks/display.ts";
import type { Task, TaskAttachment } from "#lib/types.ts";

export function createTaskAttachments(
	getTask: () => Task | null,
	getTasks: () => TaskStore,
) {
	let items = $state<TaskAttachment[]>([]);
	let failed = $state(false);
	let busy = $state(false);
	let failure = $state("");
	let input = $state<HTMLInputElement | null>(null);
	const flash = createAttachmentFlash();

	$effect(() => () => flash.dispose());

	$effect(() => {
		const task = getTask();
		if (task === null) return;
		void load(task.id);
	});

	async function load(id: string) {
		try {
			const result = await fetchFresh(getTaskAttachments({ task_id: id }));
			items = result.items;
			failed = false;
		} catch {
			failed = true;
		}
	}

	async function addFiles(files: File[]) {
		const task = getTask();
		if (task === null || files.length === 0 || busy) return;
		busy = true;
		failure = "";
		try {
			for (const file of files) {
				const content = await fileToBase64(file);
				const { item } = await addTaskAttachment({
					task_id: task.id,
					filename: file.name,
					content_base64: content,
					mime_type: file.type || undefined,
				});
				items = [...items, item];
				getTasks().bumpAttachments(task.id, 1);
			}
			flash.mark();
		} catch (error) {
			failure = messageOf(error);
		} finally {
			busy = false;
		}
	}

	async function remove(id: string) {
		const task = getTask();
		if (task === null) return;
		busy = true;
		failure = "";
		try {
			await removeTaskAttachment({ attachment_id: id });
			items = items.filter((item) => item.id !== id);
			getTasks().bumpAttachments(task.id, -1);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			busy = false;
		}
	}

	function openPicker() {
		input?.click();
	}

	return {
		get items() {
			return items;
		},
		get failed() {
			return failed;
		},
		get busy() {
			return busy;
		},
		get failure() {
			return failure;
		},
		get fresh() {
			return flash.fresh;
		},
		get count() {
			return items.length;
		},
		get input() {
			return input;
		},
		set input(element: HTMLInputElement | null) {
			input = element;
		},
		addFiles,
		remove,
		openPicker,
	};
}

export type TaskAttachmentsStore = ReturnType<typeof createTaskAttachments>;
