import type { DatabaseSync } from "node:sqlite";
import { err, ok, type Result } from "neverthrow";
import { ACTIVE_STATUSES, type Status } from "../../types";
import { withTransaction } from "../db";
import { type AppError, conflict, invalid, notFound } from "../errors";

export interface TagCount {
	tag: string;
	count: number;
	active: number;
}

export interface TagQuery {
	project_id?: string | string[];
	status?: Status[];
}

export function listTags(db: DatabaseSync, query: TagQuery = {}): TagCount[] {
	const where = [
		"tasks.deleted_at IS NULL",
		"je.value NOT IN (SELECT name FROM tags WHERE archived = 1)",
	];
	const params: (string | number)[] = [];

	const projectIds = query.project_id
		? Array.isArray(query.project_id)
			? query.project_id
			: [query.project_id]
		: undefined;
	if (projectIds?.length) {
		where.push(`tasks.project_id IN (${projectIds.map(() => "?").join(", ")})`);
		params.push(...projectIds);
	}
	if (query.status?.length) {
		where.push(`tasks.status IN (${query.status.map(() => "?").join(", ")})`);
		params.push(...query.status);
	}

	const activeSlots = ACTIVE_STATUSES.map(() => "?").join(", ");
	const sql = `SELECT je.value AS tag, COUNT(*) AS count,
			SUM(CASE WHEN tasks.status IN (${activeSlots}) THEN 1 ELSE 0 END)
				AS active
		FROM tasks, json_each(tasks.tags) AS je
		WHERE ${where.join(" AND ")}
		GROUP BY je.value
		ORDER BY count DESC, tag ASC`;

	const rows = db.prepare(sql).all(...ACTIVE_STATUSES, ...params) as {
		tag: string;
		count: number;
		active: number;
	}[];

	return rows.map((row) => ({
		tag: row.tag,
		count: Number(row.count),
		active: Number(row.active),
	}));
}

export interface TagRecord {
	name: string;
	archived: boolean;
	created_at: string;
}

const TAG_NAME_MAX_LENGTH = 20;

export function normalizeTagName(raw: string): string {
	return raw.trim().toLowerCase();
}

function mapTag(row: {
	name: string;
	archived: number;
	created_at: string;
}): TagRecord {
	return {
		name: row.name,
		archived: row.archived === 1,
		created_at: row.created_at,
	};
}

export function getTag(db: DatabaseSync, name: string): TagRecord | undefined {
	const row = db
		.prepare("SELECT * FROM tags WHERE name = ?")
		.get(normalizeTagName(name)) as
		{ name: string; archived: number; created_at: string } | undefined;
	return row ? mapTag(row) : undefined;
}

export function listDictionary(db: DatabaseSync): TagRecord[] {
	const rows = db
		.prepare("SELECT * FROM tags ORDER BY name")
		.all() as unknown as {
		name: string;
		archived: number;
		created_at: string;
	}[];
	return rows.map(mapTag);
}

function tagNameError(name: string): AppError | null {
	if (name === "") {
		return invalid("tag name is empty");
	}
	if (name.length > TAG_NAME_MAX_LENGTH) {
		return invalid(
			`tag name is too long: ${name.length} characters, max ${TAG_NAME_MAX_LENGTH}`,
		);
	}
	if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
		return invalid(
			`tag name must start with a-z or 0-9 and contain only ascii a-z, 0-9, dash or underscore: "${name}"`,
		);
	}
	return null;
}

export function ensureTag(
	db: DatabaseSync,
	raw: string,
): Result<TagRecord, AppError> {
	const name = normalizeTagName(raw);
	const invalidName = tagNameError(name);
	if (invalidName) {
		return err(invalidName);
	}
	const existing = getTag(db, name);
	if (existing) {
		if (!existing.archived) {
			return ok(existing);
		}
		db.prepare("UPDATE tags SET archived = 0 WHERE name = ?").run(name);
		return ok({ ...existing, archived: false });
	}
	const createdAt = new Date().toISOString();
	db.prepare(
		"INSERT INTO tags (name, archived, created_at) VALUES (?, 0, ?)",
	).run(name, createdAt);
	return ok({ name, archived: false, created_at: createdAt });
}

export function setTagArchived(
	db: DatabaseSync,
	raw: string,
	archived: boolean,
): Result<TagRecord, AppError> {
	const name = normalizeTagName(raw);
	const existing = getTag(db, name);
	if (!existing) {
		return err(notFound(`tag ${name} not found`));
	}
	if (existing.archived !== archived) {
		db.prepare("UPDATE tags SET archived = ? WHERE name = ?").run(
			archived ? 1 : 0,
			name,
		);
	}
	return ok({ ...existing, archived });
}

export function renameTag(
	db: DatabaseSync,
	raw: string,
	rawNext: string,
): Result<TagRecord, AppError> {
	const name = normalizeTagName(raw);
	const next = normalizeTagName(rawNext);
	const existing = getTag(db, name);
	if (!existing) {
		return err(notFound(`tag ${name} not found`));
	}
	if (next === name) {
		return ok(existing);
	}
	const invalidName = tagNameError(next);
	if (invalidName) {
		return err(invalidName);
	}
	if (getTag(db, next)) {
		return err(conflict(`tag ${next} already exists`));
	}
	return ok(
		withTransaction(db, () => {
			db.prepare("UPDATE tags SET name = ? WHERE name = ?").run(next, name);
			const rows = db
				.prepare(
					"SELECT id, tags FROM tasks WHERE EXISTS (SELECT 1 FROM json_each(tasks.tags) WHERE value = ?)",
				)
				.all(name) as unknown as { id: string; tags: string }[];
			const update = db.prepare("UPDATE tasks SET tags = ? WHERE id = ?");
			for (const row of rows) {
				const tags: string[] = JSON.parse(row.tags);
				const renamed = [
					...new Set(tags.map((tag) => (tag === name ? next : tag))),
				];
				update.run(JSON.stringify(renamed), row.id);
			}
			return { ...existing, name: next };
		}),
	);
}

export function validateTags(
	db: DatabaseSync,
	tags: string[],
): AppError | null {
	if (tags.length === 0) {
		return null;
	}
	const dictionary = listDictionary(db);
	const active = new Set(
		dictionary.filter((tag) => !tag.archived).map((tag) => tag.name),
	);
	const unknown = tags.filter((tag) => !active.has(tag));
	if (unknown.length > 0) {
		const archived = unknown.filter((tag) =>
			dictionary.some((entry) => entry.name === tag && entry.archived),
		);
		const usage = new Map(
			listTags(db).map((entry) => [entry.tag, entry.count]),
		);
		const options = [...active]
			.map((name) => ({ name, count: usage.get(name) ?? 0 }))
			.sort((left, right) => right.count - left.count)
			.slice(0, 12)
			.map((entry) => `${entry.name} (${entry.count})`)
			.join(", ");
		const archivedPart =
			archived.length > 0
				? ` Archived: ${archived.join(", ")} - restore with tags_update {name, patch:{archived:false}} or pick another.`
				: "";
		return invalid(
			`unknown tag(s): ${unknown.join(", ")}. Existing tags: ${options}. See tags_list for the full list; create a genuinely new tag with tags_create {name}.${archivedPart}`,
		);
	}
	return null;
}
