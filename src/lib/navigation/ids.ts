export const NAV_IDS = [
	"tasks",
	"kanban",
	"activity",
	"deleted",
	"plans",
	"documents",
	"tags",
	"backups",
] as const;

export type NavId = (typeof NAV_IDS)[number];

export const DEFAULT_PINNED: readonly NavId[] = ["tasks", "plans"];
