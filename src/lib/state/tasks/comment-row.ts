import { getContext, setContext } from "svelte";

export interface CommentRow {
	readonly busy: boolean;
	isEditing(id: string): boolean;
	startEdit(id: string): void;
	save(id: string, body: string): void;
	cancel(): void;
	remove(id: string): void;
}

const COMMENT_ROW_KEY = Symbol("xboct-log:comment-row");

export function provideCommentRow(row: CommentRow) {
	setContext(COMMENT_ROW_KEY, row);
}

export function useCommentRow(): CommentRow {
	const row = getContext<CommentRow | undefined>(COMMENT_ROW_KEY);
	if (!row) {
		throw new Error("comment row context is not provided");
	}
	return row;
}
