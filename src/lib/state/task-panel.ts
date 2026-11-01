import { getContext, setContext } from "svelte";
import type { ClosedReason, Task } from "#lib/types.ts";

export interface TaskPanel {
	readonly task: Task;
	readonly saving: boolean;
	readonly failure: string | null;
	readonly repo: string | null;
	readonly historyOpen: boolean;
	readonly commentsOpen: boolean;
	openHistory(): void;
	closeHistory(): void;
	openComments(): void;
	closeComments(): void;
	close(): void;
	closeTask(reason: ClosedReason): void;
	reopen(): void;
	remove(): void;
}

const TASK_PANEL_KEY = Symbol("xboct-log:task-panel");

export function provideTaskPanel(panel: TaskPanel) {
	setContext(TASK_PANEL_KEY, panel);
}

export function useTaskPanel(): TaskPanel {
	const panel = getContext<TaskPanel | undefined>(TASK_PANEL_KEY);
	if (!panel) {
		throw new Error("task panel context is not provided");
	}
	return panel;
}
