<script lang="ts">
	import type { Snippet } from "svelte";
	import TitleField from "#lib/components/task/TitleField.svelte";
	import AdvancedFields from "#lib/components/task/AdvancedFields.svelte";
	import ProjectScopeFields from "#lib/components/task/ProjectScopeFields.svelte";
	import TaskFields from "#lib/components/task/TaskFields.svelte";
	import TaskLinks from "#lib/components/task/TaskLinks.svelte";
	import SectionDivider from "#lib/components/ui/SectionDivider.svelte";
	import {
		provideTaskEditor,
		type TaskEditor,
	} from "#lib/state/task-editor.ts";
	import { advancedFilledCount } from "#lib/tasks/fields.ts";

	interface Props {
		editor: TaskEditor;
		title: string;
		titleId?: string;
		titleTrailing?: Snippet;
		ontitlecommit?: (title: string) => void;
		ontitlefocus?: () => void;
		attachments?: Snippet;
	}

	let {
		editor,
		title = $bindable(""),
		titleId,
		titleTrailing,
		ontitlecommit,
		ontitlefocus,
		attachments,
	}: Props = $props();

	provideTaskEditor({
		get current() {
			return editor;
		},
	});
</script>

<TitleField
	bind:value={title}
	id={titleId}
	oncommit={ontitlecommit}
	onfocus={ontitlefocus}
	trailing={titleTrailing}
/>

<ProjectScopeFields />

<TaskFields />

<TaskLinks />

<SectionDivider
	title="Advanced"
	count={advancedFilledCount(editor.value)}
	open={editor.advancedOpen}
	onopenchange={editor.onadvancedchange}
>
	<AdvancedFields />
</SectionDivider>

{@render attachments?.()}
