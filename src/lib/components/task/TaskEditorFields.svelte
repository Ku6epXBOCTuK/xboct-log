<script lang="ts">
	import type { Snippet } from "svelte";
	import TitleField from "#lib/components/task/TitleField.svelte";
	import AdvancedFields from "#lib/components/task/AdvancedFields.svelte";
	import ProjectScopeFields from "#lib/components/task/ProjectScopeFields.svelte";
	import TaskFields from "#lib/components/task/TaskFields.svelte";
	import TaskLinks from "#lib/components/task/TaskLinks.svelte";
	import SectionDivider from "#lib/components/ui/SectionDivider.svelte";
	import type { TagPicker } from "#lib/state/tags.svelte.ts";
	import {
		advancedFilledCount,
		type TaskFieldValues,
		type TaskPatch,
	} from "#lib/tasks/fields.ts";
	import type { LinkField, TaskLinkDraft } from "#lib/tasks/links.ts";
	import type { Project, Scope, Status, Task } from "#lib/types.ts";

	interface Props {
		value: TaskFieldValues;
		title: string;
		titleId?: string;
		titleTrailing?: Snippet;
		ontitlecommit?: (title: string) => void;
		ontitlefocus?: () => void;

		epics: Task[];
		projects: Project[];
		scopes: Scope[];
		repo?: string | null;
		tagPicker: TagPicker;
		taskId?: string;

		linkFields: TaskLinkDraft;
		linkCandidates: Task[];
		blockerCandidates: Task[];
		onlinkadd: (field: LinkField, id: string) => void;
		onlinkremove: (field: LinkField, id: string) => void;
		linkHref?: (id: string) => string | null;
		onlinkopen?: (id: string) => void;
		onlinksearch?: (query: string) => void;
		linkUnavailable?: (id: string) => string | null;
		canMarkBlocked?: boolean;
		busy?: boolean;
		onmarkblocked?: () => void;

		onfield: (patch: TaskPatch) => void;
		onproject: (projectId: string) => void;
		onnewscope: (name: string) => Promise<number>;
		onunknowntag: (tag: string) => Promise<unknown>;
		onerror: (message: string) => void;

		editing?: boolean;
		status?: Status;
		onstatus?: (status: Status) => void;
		statusWarn?: boolean;
		blockedReason?: string;
		onblockedreason?: (reason: string | null) => void;
		ondraft?: (patch: TaskPatch) => void;
		oncanceldraft?: () => void;
		oncreatechild?: () => void;
		commentsCount?: number;
		oncomments?: () => void;

		advancedOpen: boolean;
		onadvancedchange: (open: boolean) => void;

		attachments?: Snippet;
	}

	let {
		value,
		title = $bindable(""),
		titleId,
		titleTrailing,
		ontitlecommit,
		ontitlefocus,
		epics,
		projects,
		scopes,
		repo = null,
		tagPicker,
		taskId,
		linkFields,
		linkCandidates,
		blockerCandidates,
		onlinkadd,
		onlinkremove,
		linkHref,
		onlinkopen,
		onlinksearch,
		linkUnavailable,
		canMarkBlocked = false,
		busy = false,
		onmarkblocked,
		onfield,
		onproject,
		onnewscope,
		onunknowntag,
		onerror,
		editing = false,
		status,
		onstatus,
		statusWarn = false,
		blockedReason = "",
		onblockedreason,
		ondraft,
		oncanceldraft,
		oncreatechild,
		commentsCount,
		oncomments,
		advancedOpen,
		onadvancedchange,
		attachments,
	}: Props = $props();
</script>

<TitleField
	bind:value={title}
	id={titleId}
	oncommit={ontitlecommit}
	onfocus={ontitlefocus}
	trailing={titleTrailing}
/>

<ProjectScopeFields
	{value}
	{projects}
	{scopes}
	{editing}
	{onfield}
	{onproject}
	{onnewscope}
/>

<TaskFields
	{value}
	{epics}
	{taskId}
	{repo}
	tagSuggestions={tagPicker.suggestions}
	tagCounts={tagPicker.counts}
	{editing}
	{status}
	{onstatus}
	{statusWarn}
	{blockedReason}
	{onblockedreason}
	{onfield}
	{ondraft}
	{oncanceldraft}
	{oncreatechild}
	{commentsCount}
	{oncomments}
	{onunknowntag}
/>

<TaskLinks
	blockedBy={linkFields.blocked_by}
	blocks={linkFields.blocks}
	relatesTo={linkFields.relates_to}
	duplicates={linkFields.duplicates}
	duplicatedBy={linkFields.duplicated_by}
	candidates={linkCandidates}
	{blockerCandidates}
	onadd={onlinkadd}
	onremove={onlinkremove}
	href={linkHref}
	onlink={onlinkopen}
	onsearch={onlinksearch}
	unavailable={linkUnavailable}
	{canMarkBlocked}
	{busy}
	{onmarkblocked}
/>

<SectionDivider
	title="Advanced"
	count={advancedFilledCount(value)}
	open={advancedOpen}
	onopenchange={onadvancedchange}
>
	<AdvancedFields {value} {onfield} {onerror} />
</SectionDivider>

{@render attachments?.()}
