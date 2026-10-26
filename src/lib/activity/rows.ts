import type { ActivityItem, ActivityLogItem } from "#lib/types.ts";

export type ActivityRowItem = ActivityItem &
	Partial<Pick<ActivityLogItem, "entity" | "entity_id">>;
