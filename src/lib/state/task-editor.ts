import { getContext, setContext } from "svelte";
import type { TagPicker } from "#lib/state/tags.svelte.ts";
import type { TaskFieldValues, TaskPatch } from "#lib/tasks/fields.ts";
import type { LinkField, TaskLinkDraft } from "#lib/tasks/links.ts";
import type { Project, Scope, Status, Task } from "#lib/types.ts";

export interface TaskEditor {
	readonly value: TaskFieldValues;
	readonly editing: boolean;
	readonly taskId?: string;
	readonly repo: string | null;
	readonly epics: Task[];
	readonly projects: Project[];
	readonly scopes: Scope[];
	readonly tagPicker: TagPicker;
	readonly status?: Status;
	readonly statusWarn: boolean;
	readonly blockedReason: string;
	readonly commentsCount?: number;
	readonly advancedOpen: boolean;
	readonly linkFields: TaskLinkDraft;
	readonly linkCandidates: Task[];
	readonly blockerCandidates: Task[];
	readonly canMarkBlocked: boolean;
	readonly busy: boolean;
	readonly onfield: (patch: TaskPatch) => void;
	readonly onproject: (projectId: string) => void;
	readonly onnewscope: (name: string) => Promise<number>;
	readonly onerror: (message: string) => void;
	readonly onstatus?: (status: Status) => void;
	readonly onblockedreason?: (reason: string | null) => void;
	readonly ondraft?: (patch: TaskPatch) => void;
	readonly oncanceldraft?: () => void;
	readonly oncreatechild?: () => void;
	readonly oncomments?: () => void;
	readonly onunknowntag?: (tag: string) => Promise<unknown>;
	readonly onlinkadd: (field: LinkField, id: string) => void;
	readonly onlinkremove: (field: LinkField, id: string) => void;
	readonly linkHref?: (id: string) => string | null;
	readonly onlinkopen?: (id: string) => void;
	readonly onlinksearch?: (query: string) => void;
	readonly linkUnavailable?: (id: string) => string | null;
	readonly onmarkblocked?: () => void;
	readonly onadvancedchange: (open: boolean) => void;
}

export interface TaskEditorSlot {
	readonly current: TaskEditor;
}

const TASK_EDITOR_KEY = Symbol("xboct-log:task-editor");

export function provideTaskEditor(slot: TaskEditorSlot) {
	setContext(TASK_EDITOR_KEY, slot);
}

export function useTaskEditorSlot(): TaskEditorSlot {
	const slot = getContext<TaskEditorSlot | undefined>(TASK_EDITOR_KEY);
	if (!slot) {
		throw new Error("task editor context is not provided");
	}
	return slot;
}
