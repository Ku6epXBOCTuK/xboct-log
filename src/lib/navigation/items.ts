import { resolve } from "$app/paths";
import type { Component } from "svelte";
import type { SvelteHTMLElements } from "svelte/elements";
import Activity from "~icons/lucide/activity";
import ArchiveRestore from "~icons/lucide/archive-restore";
import ClipBoardList from "~icons/lucide/clipboard-list";
import DatabaseBackup from "~icons/lucide/database-backup";
import FileText from "~icons/lucide/file-text";
import FolderKanban from "~icons/lucide/folder-kanban";
import ListOrdered from "~icons/lucide/list-ordered";
import Tag from "~icons/lucide/tag";
import { listHref } from "#lib/navigation/href.ts";
import { parsePath } from "#lib/navigation/paths.ts";
import type { NavId } from "#lib/navigation/ids.ts";

type Icon = Component<SvelteHTMLElements["svg"]>;

export interface NavItem {
	id: NavId;
	label: string;
	icon: Icon;
	href: (project: string | null) => string;
	active: (pathname: string) => boolean;
	badge?: "tasks" | "kanban";
}

export const NAV_ITEMS: readonly NavItem[] = [
	{
		id: "tasks",
		label: "Tasks",
		icon: ClipBoardList,
		href: (project) => listHref("tasks", project),
		active: (pathname) => parsePath(pathname).category === "tasks",
		badge: "tasks",
	},
	{
		id: "kanban",
		label: "Kanban",
		icon: FolderKanban,
		href: (project) => listHref("kanban", project),
		active: (pathname) => parsePath(pathname).category === "kanban",
		badge: "kanban",
	},
	{
		id: "activity",
		label: "Activity",
		icon: Activity,
		href: (project) => listHref("activity", project),
		active: (pathname) => parsePath(pathname).category === "activity",
	},
	{
		id: "deleted",
		label: "Deleted",
		icon: ArchiveRestore,
		href: (project) => listHref("deleted", project),
		active: (pathname) => parsePath(pathname).category === "deleted",
	},
	{
		id: "plans",
		label: "Plans",
		icon: ListOrdered,
		href: () => resolve("/plans"),
		active: (pathname) => pathname === "/plans",
	},
	{
		id: "documents",
		label: "Documents",
		icon: FileText,
		href: (project) => listHref("documents", project),
		active: (pathname) => parsePath(pathname).category === "documents",
	},
	{
		id: "tags",
		label: "Tags",
		icon: Tag,
		href: () => resolve("/tags"),
		active: (pathname) => pathname === "/tags",
	},
	{
		id: "backups",
		label: "Backups",
		icon: DatabaseBackup,
		href: () => resolve("/backups"),
		active: (pathname) => pathname === "/backups",
	},
];
