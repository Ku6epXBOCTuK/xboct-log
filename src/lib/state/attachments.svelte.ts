import {
	addTaskAttachment,
	copyTaskAttachment,
	getTaskAttachments,
	moveTaskAttachment,
	removeTaskAttachment,
} from "#lib/remote/attachments.remote.ts";
import { fetchFresh } from "#lib/remote/fresh.ts";
import { createAttachmentFlash } from "#lib/state/attachment-flash.svelte.ts";
import { createAttachmentNotice } from "#lib/state/attachment-notice.svelte.ts";
import type { TaskStore } from "#lib/state/tasks.svelte.ts";
import { filterFiles, rejectionMessage } from "#lib/tasks/attachment-kinds.ts";
import {
	attachEach,
	fileToBase64,
	type AttachmentEntry,
	type UploadOutcome,
} from "#lib/tasks/attachments.ts";
import { messageOf } from "#lib/tasks/display.ts";
import type { Task, TaskAttachment } from "#lib/types.ts";

function createFeedback() {
	const flash = createAttachmentFlash();
	const notice = createAttachmentNotice();

	$effect(() => () => {
		flash.dispose();
		notice.dispose();
	});

	return { flash, notice };
}

export function createDraftAttachments() {
	let files = $state<{ key: string; file: File }[]>([]);
	let input = $state<HTMLInputElement | null>(null);
	let sequence = 0;
	const { flash, notice } = createFeedback();

	const entries = $derived<AttachmentEntry[]>(
		files.map(({ key, file }) => ({ kind: "file", key, file })),
	);

	function nextKey(): string {
		sequence += 1;
		return `file-${sequence}`;
	}

	function addFiles(added: File[]) {
		if (added.length === 0) return;
		const { accepted, rejected } = filterFiles(added);
		if (rejected.length > 0) notice.show(rejectionMessage(rejected));
		if (accepted.length === 0) return;
		files = [...files, ...accepted.map((file) => ({ key: nextKey(), file }))];
		flash.mark();
	}

	function restore(saved: File[]) {
		files = saved.map((file) => ({ key: nextKey(), file }));
	}

	function remove(key: string) {
		files = files.filter((item) => item.key !== key);
	}

	function clear() {
		files = [];
	}

	async function upload(taskId: string): Promise<UploadOutcome> {
		const outcome = await attachEach(files, async (item) => {
			const content = await fileToBase64(item.file);
			await addTaskAttachment({
				task_id: taskId,
				filename: item.file.name,
				content_base64: content,
			});
		});
		if (outcome.attached.length > 0) {
			files = files.filter((item) => !outcome.attached.includes(item.key));
			flash.mark();
		}
		return outcome;
	}

	function openPicker() {
		input?.click();
	}

	return {
		get entries() {
			return entries;
		},
		get files() {
			return files.map((item) => item.file);
		},
		get count() {
			return files.length;
		},
		get fresh() {
			return flash.fresh;
		},
		get notice() {
			return notice.message;
		},
		get denied() {
			return notice.denied;
		},
		get input() {
			return input;
		},
		set input(element: HTMLInputElement | null) {
			input = element;
		},
		addFiles,
		restore,
		remove,
		clear,
		upload,
		openPicker,
	};
}

export function createSavedAttachments(
	getTask: () => Task | null,
	getTasks: () => TaskStore,
) {
	let items = $state<TaskAttachment[]>([]);
	let failed = $state(false);
	let busy = $state(false);
	let failure = $state("");
	let input = $state<HTMLInputElement | null>(null);
	let status = $state("");
	let statusTimer: ReturnType<typeof setTimeout> | null = null;
	const { flash, notice } = createFeedback();

	function say(message: string) {
		status = message;
		if (statusTimer !== null) clearTimeout(statusTimer);
		statusTimer = setTimeout(() => {
			status = "";
			statusTimer = null;
		}, 4000);
	}

	$effect(() => () => {
		if (statusTimer !== null) clearTimeout(statusTimer);
	});

	const entries = $derived<AttachmentEntry[]>(
		items.map((attachment) => ({
			kind: "saved",
			key: attachment.id,
			attachment,
		})),
	);

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

	function reload() {
		const task = getTask();
		if (task !== null) void load(task.id);
	}

	async function addFiles(files: File[]) {
		const task = getTask();
		if (task === null || files.length === 0 || busy) return;
		const { accepted, rejected } = filterFiles(files);
		if (rejected.length > 0) notice.show(rejectionMessage(rejected));
		if (accepted.length === 0) return;
		busy = true;
		failure = "";
		try {
			for (const file of accepted) {
				const content = await fileToBase64(file);
				const { item } = await addTaskAttachment({
					task_id: task.id,
					filename: file.name,
					content_base64: content,
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

	async function move(
		id: string,
		target: string,
		copy: boolean,
	): Promise<string | null> {
		const task = getTask();
		if (task === null) return "the task is gone";
		busy = true;
		try {
			if (copy) {
				await copyTaskAttachment({ attachment_id: id, task_id: target });
				say(`Copied to ${target}`);
				return null;
			}
			await moveTaskAttachment({ attachment_id: id, task_id: target });
			items = items.filter((item) => item.id !== id);
			getTasks().bumpAttachments(task.id, -1);
			say(`Moved to ${target}`);
			return null;
		} catch (error) {
			return messageOf(error);
		} finally {
			busy = false;
		}
	}

	return {
		get entries() {
			return entries;
		},
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
		get notice() {
			return notice.message;
		},
		get status() {
			return status;
		},
		get denied() {
			return notice.denied;
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
		move,
		reload,
		openPicker,
	};
}

export type DraftAttachmentsStore = ReturnType<typeof createDraftAttachments>;
export type SavedAttachmentsStore = ReturnType<typeof createSavedAttachments>;
