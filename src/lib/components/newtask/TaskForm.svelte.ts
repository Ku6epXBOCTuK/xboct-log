import { createDraftAttachments } from "#lib/state/attachments/attachments.svelte.ts";
import { useBoard } from "#lib/state/board.svelte.ts";
import { createTaskFinder } from "#lib/state/tasks/task-finder.svelte.ts";
import type { TaskEditor } from "#lib/state/tasks/task-editor.ts";
import { matchesHotkey } from "#lib/hotkeys/hotkeys.ts";
import { taskHrefFor } from "#lib/navigation/href.ts";
import type { UploadFailure } from "#lib/tasks/attachments/attachments.ts";
import { messageOf } from "#lib/tasks/presentation/display.ts";
import {
	draftHasContent,
	epicsForProject,
	fitDraftToProjects,
	validateTaskDraft,
	type TaskFieldValues,
	type TaskPatch,
} from "#lib/tasks/fields/fields.ts";
import {
	applyLinkJobs,
	emptyLinkDraft,
	hasLinks,
	type LinkFailure,
	type LinkField,
	type LinkJob,
	type TaskLinkDraft,
} from "#lib/tasks/relations/links.ts";
import { CLOSED_STATUSES, INBOX_PROJECT_ID, type Task } from "#lib/types.ts";
import { SvelteSet } from "svelte/reactivity";
import { untrack } from "svelte";

export interface TaskFormProps {
	initialProject?: string;
	initialEpic?: string | null;
	initialScope?: number | null;
	onclose: () => void;
	onopen?: (id: string) => void;
}

export function createTaskForm(props: TaskFormProps) {
	const {
		tasks,
		scopes,
		tags,
		data,
		stats,
		draft: draftStore,
		ui,
		projects: projectStore,
	} = useBoard();
	const {
		initialProject,
		initialEpic = null,
		initialScope = null,
		onclose,
		onopen,
	} = props;

	const projects = $derived(projectStore.active);
	const epics = $derived(stats.epics);

	function defaultProject(): string {
		if (
			initialProject !== undefined &&
			projects.some((project) => project.id === initialProject)
		) {
			return initialProject;
		}
		if (projects.some((project) => project.id === INBOX_PROJECT_ID)) {
			return INBOX_PROJECT_ID;
		}
		return projects[0]?.id ?? "";
	}

	function blankDraft(): TaskFieldValues {
		return {
			project_id: defaultProject(),
			status: "backlog",
			priority: "medium",
			is_epic: false,
			epic_id: initialEpic,
			scope_id: initialScope,
			source_file: null,
			tags: [],
			estimate: null,
			assignee: null,
			due_at: null,
			description: "",
		};
	}

	let draft = $state<TaskFieldValues>(blankDraft());
	let links = $state<TaskLinkDraft>(emptyLinkDraft());
	const finder = createTaskFinder();
	const projectData = $derived(data.of(draft.project_id));
	const projectRepo = $derived(
		projects.find((project) => project.id === draft.project_id)?.repo ?? null,
	);
	const tagPicker = $derived(tags.picker(projectData?.tags ?? []));
	let title = $state("");
	let keepOpen = $state(false);
	let saving = $state(false);
	let failure = $state<string | null>(null);
	let invalidField = $state(false);
	let formElement = $state<HTMLFormElement | null>(null);
	let dragging = $state(false);
	let committed = $state(false);
	let created = $state<{ id: string; title: string } | null>(null);
	const attachmentsStore = createDraftAttachments();

	untrack(() => {
		const restored = draftStore.saved;
		if (!restored) return;
		draft = fitDraftToProjects(
			{ ...blankDraft(), ...restored.values, tags: [...restored.values.tags] },
			projects,
			epics,
			scopes.all,
			defaultProject(),
		);
		title = restored.title;
		attachmentsStore.restore(restored.files ?? []);
		links = { ...emptyLinkDraft(), ...restored.links };
	});

	const epicOptions = $derived(
		epicsForProject(epics, draft.project_id, draft.epic_id),
	);
	const scopeOptions = $derived(scopes.listFor(draft.project_id));

	function openTasks(base: Task[]): Task[] {
		return base.filter((task) => !CLOSED_STATUSES.includes(task.status));
	}

	function append(base: Task[], extra: Task[]): Task[] {
		const ids = new SvelteSet(base.map((task) => task.id));
		return [...base, ...extra.filter((task) => !ids.has(task.id))];
	}

	const linkCandidates = $derived(
		append(openTasks(projectData?.tasks ?? []), openTasks(finder.found)),
	);

	const pendingLinks = $derived(
		(Object.entries(links) as [LinkField, string[]][]).flatMap(
			([field, targets]) =>
				targets.map((target) => `${field.replaceAll("_", " ")} ${target}`),
		),
	);

	const retryLabel = $derived(
		attachmentsStore.count > 0
			? "Retry upload"
			: pendingLinks.length > 0
				? "Retry links"
				: "Done",
	);

	function linkHref(id: string): string | null {
		return taskHrefFor(
			(value) =>
				linkCandidates.find((item) => item.id === value) ?? tasks.byId(value),
			id,
		);
	}

	function addLink(field: LinkField, id: string) {
		links = { ...links, [field]: [...links[field], id] };
	}

	function removeLink(field: LinkField, id: string) {
		links = { ...links, [field]: links[field].filter((item) => item !== id) };
	}

	$effect(() => {
		data.ensure(draft.project_id);
	});

	$effect(() => {
		formElement?.querySelector<HTMLInputElement>("#new-task-title")?.focus();
	});

	$effect(() => {
		const values = { ...draft, tags: [...draft.tags] };
		const snapshot = { ...links };
		if (committed || (!draftHasContent(values, title) && !hasLinks(snapshot)))
			return;
		draftStore.save({
			values,
			title,
			files: attachmentsStore.files,
			links: snapshot,
		});
	});

	function reset() {
		draft = {
			...blankDraft(),
			project_id: draft.project_id,
			scope_id: draft.scope_id,
		};
		links = emptyLinkDraft();
		title = "";
		attachmentsStore.clear();
		failure = null;
		invalidField = false;
		committed = false;
		created = null;
	}

	function pickFiles(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const picked = [...(target.files ?? [])];
		target.value = "";
		attachmentsStore.addFiles(picked);
	}

	function paste(event: ClipboardEvent) {
		const files = [...(event.clipboardData?.files ?? [])];
		if (files.length === 0) return;
		event.preventDefault();
		attachmentsStore.addFiles(files);
	}

	function onfield(patch: TaskPatch) {
		Object.assign(draft, patch);
		failure = null;
		invalidField = false;
	}

	function cancel() {
		committed = true;
		draftStore.clearDraft();
		onclose();
	}

	function backToLast() {
		const last = draftStore.last;
		if (!last) return;
		onopen?.(last.id);
	}

	function onproject(projectId: string) {
		Object.assign(draft, {
			project_id: projectId,
			epic_id: null,
			scope_id: null,
		});
		failure = null;
		invalidField = false;
	}

	async function onnewscope(name: string): Promise<number> {
		const scope = await scopes.create({
			project_id: draft.project_id,
			name,
		});
		return scope.id;
	}

	async function onunknowntag(name: string) {
		await tags.create(name);
	}

	function onkeydown(event: KeyboardEvent) {
		if (matchesHotkey(event, "ctrl+alt+c")) {
			event.preventDefault();
			keepOpen = !keepOpen;
			return;
		}

		if (event.key !== "Enter") return;
		if (!event.ctrlKey && !event.metaKey) return;

		event.preventDefault();

		if (saving) return;

		// NOTE: fields commit on change (blur), so the focused control must be
		// blurred before submit or its edit is missing from the draft.
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}

		formElement?.requestSubmit();
	}

	function linkJobs(taskId: string): LinkJob[] {
		const jobs: LinkJob[] = [];
		for (const target of links.blocked_by) {
			jobs.push({
				field: "blocked_by",
				target,
				run: () => tasks.addBlocker(taskId, target),
			});
		}
		for (const target of links.blocks) {
			jobs.push({
				field: "blocks",
				target,
				run: () => tasks.addBlocker(target, taskId),
			});
		}
		for (const target of links.relates_to) {
			jobs.push({
				field: "relates_to",
				target,
				run: () => tasks.addLink(taskId, "relates_to", target),
			});
		}
		for (const target of links.duplicates) {
			jobs.push({
				field: "duplicates",
				target,
				run: () => tasks.addLink(taskId, "duplicates", target),
			});
		}
		for (const target of links.duplicated_by) {
			jobs.push({
				field: "duplicated_by",
				target,
				run: () => tasks.addLink(target, "duplicates", taskId),
			});
		}
		return jobs;
	}

	function linkFailureMessage(items: LinkFailure[]): string {
		const names = items.map(
			(item) =>
				`${item.field.replaceAll("_", " ")} ${item.target}: ${item.message}`,
		);
		return `${items.length} ${items.length === 1 ? "link was" : "links were"} not saved: ${names.join("; ")}`;
	}

	async function applyLinks(taskId: string) {
		const failures = await applyLinkJobs(linkJobs(taskId), (job) =>
			removeLink(job.field, job.target),
		);
		if (failures.length > 0) failure = linkFailureMessage(failures);
		return failures.length === 0;
	}

	function uploadFailure(items: UploadFailure[]): string {
		const names = items.map((item) => `${item.name}: ${item.message}`);
		return `${items.length} ${items.length === 1 ? "file was" : "files were"} not attached: ${names.join("; ")}`;
	}

	async function sendAttachments(taskId: string): Promise<boolean> {
		if (attachmentsStore.count === 0) return true;
		const outcome = await attachmentsStore.upload(taskId);
		if (outcome.attached.length > 0) {
			tasks.bumpAttachments(taskId, outcome.attached.length);
		}
		if (outcome.failed.length === 0) return true;
		failure = uploadFailure(outcome.failed);
		return false;
	}

	async function finishCreated(taskId: string) {
		if (!(await applyLinks(taskId))) return;

		if (keepOpen) {
			reset();
		} else {
			onclose();
		}
	}

	async function retryUpload() {
		if (created === null) return;
		saving = true;
		try {
			if (!(await sendAttachments(created.id))) return;
			await finishCreated(created.id);
		} catch (error) {
			failure = messageOf(error);
		} finally {
			saving = false;
		}
	}

	function openCreated() {
		if (created === null) return;
		if (onopen === undefined) {
			onclose();
			return;
		}
		onopen(created.id);
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();

		if (invalidField || saving) return;

		failure = null;

		if (created !== null) {
			await retryUpload();
			return;
		}

		if (draft.project_id === "") {
			failure = "create a project first";
			return;
		}

		const invalid = validateTaskDraft({
			title,
			source_file: draft.source_file ?? "",
		});

		if (invalid !== null) {
			failure = invalid;
			return;
		}

		committed = true;
		saving = true;

		try {
			const task = await tasks.create({
				project_id: draft.project_id,
				title: title.trim(),
				description: draft.description,
				status: draft.status,
				priority: draft.priority,
				is_epic: draft.is_epic,
				epic_id: draft.is_epic ? null : draft.epic_id,
				scope_id: draft.scope_id,
				source_file: draft.source_file,
				tags: draft.tags,
				estimate: draft.estimate,
				assignee: draft.assignee,
				due_at: draft.due_at,
			});

			draftStore.setLast({ id: task.id, title: task.title });
			draftStore.clearDraft();
			created = { id: task.id, title: task.title };

			if (!(await sendAttachments(task.id))) return;

			await finishCreated(task.id);
		} catch (error) {
			failure = messageOf(error);
			if (created === null) committed = false;
		} finally {
			saving = false;
		}
	}

	const editor = $derived<TaskEditor>({
		value: draft,
		editing: false,
		repo: projectRepo,
		epics: epicOptions,
		projects,
		scopes: scopeOptions,
		tagPicker,
		status: draft.status,
		statusWarn: draft.status !== "backlog",
		blockedReason: "",
		advancedOpen: ui.advanced,
		linkFields: links,
		linkCandidates,
		blockerCandidates: linkCandidates,
		canMarkBlocked: false,
		busy: false,
		onfield,
		onproject,
		onnewscope,
		onunknowntag,
		onerror: (message) => {
			failure = message;
			invalidField = true;
		},
		onstatus: (status) => onfield({ status }),
		onlinkadd: addLink,
		onlinkremove: removeLink,
		linkHref,
		onlinkopen: onclose,
		onlinksearch: finder.search,
		onadvancedchange: (value) => ui.set(value),
	});

	return {
		get draft() {
			return draft;
		},
		get links() {
			return links;
		},
		get title() {
			return title;
		},
		set title(value: string) {
			title = value;
		},
		get formElement() {
			return formElement;
		},
		set formElement(value: HTMLFormElement | null) {
			formElement = value;
		},
		get dragging() {
			return dragging;
		},
		set dragging(value: boolean) {
			dragging = value;
		},
		get keepOpen() {
			return keepOpen;
		},
		set keepOpen(value: boolean) {
			keepOpen = value;
		},
		get saving() {
			return saving;
		},
		get failure() {
			return failure;
		},
		get created() {
			return created;
		},
		get pendingLinks() {
			return pendingLinks;
		},
		get retryLabel() {
			return retryLabel;
		},
		get editor() {
			return editor;
		},
		get attachments() {
			return attachmentsStore;
		},
		get last() {
			return draftStore.last;
		},
		get canOpen() {
			return onopen !== undefined;
		},
		cancel,
		submit,
		onkeydown,
		paste,
		pickFiles,
		backToLast,
		openCreated,
	};
}

export type TaskForm = ReturnType<typeof createTaskForm>;
