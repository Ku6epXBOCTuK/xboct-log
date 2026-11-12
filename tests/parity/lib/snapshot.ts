import type { DatabaseSync } from "node:sqlite";
import { createNormalizer, type NormalizerOptions } from "./normalize.ts";

interface MasterRow {
	type: string;
	name: string;
	tbl_name: string;
	sql: string | null;
}

interface ColumnRow {
	cid: number;
	name: string;
	type: string;
	notnull: number;
	dflt_value: string | null;
	pk: number;
}

type Row = Record<string, unknown>;

export interface DatabaseDocument {
	schema: MasterRow[];
	columns: Record<string, Omit<ColumnRow, "cid">[]>;
	sequences: { name: string; seq: number }[];
	rows: Record<string, Row[]>;
}

function quote(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

function masterRows(db: DatabaseSync): MasterRow[] {
	return db
		.prepare(
			"SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
		)
		.all() as unknown as MasterRow[];
}

function tableColumns(db: DatabaseSync, table: string): ColumnRow[] {
	return db
		.prepare(`PRAGMA table_info(${quote(table)})`)
		.all() as unknown as ColumnRow[];
}

function tableRows(
	db: DatabaseSync,
	table: string,
	columns: ColumnRow[],
	sql: string | null,
): Row[] {
	const primary = columns
		.filter((column) => column.pk > 0)
		.sort((left, right) => left.pk - right.pk)
		.map((column) => quote(column.name));
	const withoutRowid = /WITHOUT\s+ROWID/i.test(sql ?? "");
	const order =
		!withoutRowid || primary.length === 0 ? "rowid" : primary.join(", ");
	return db
		.prepare(`SELECT * FROM ${quote(table)} ORDER BY ${order}`)
		.all() as unknown as Row[];
}

// NOTE: uuid values are random on every run, so they are named after the row
// that owns them instead of their position, or two databases never compare.
function identitiesOf(rows: Record<string, Row[]>): Map<string, string> {
	const identities = new Map<string, string>();
	for (const task of rows.tasks ?? []) {
		identities.set(String(task.id).toLowerCase(), `task:${task.key}`);
	}
	for (const [index, attachment] of (rows.task_attachments ?? []).entries()) {
		identities.set(
			String(attachment.id).toLowerCase(),
			`attachment:${index + 1}`,
		);
	}
	for (const [index, comment] of (rows.task_comments ?? []).entries()) {
		identities.set(String(comment.id).toLowerCase(), `comment:${index + 1}`);
	}
	return identities;
}

// NOTE: a relates_to link is stored with the endpoints in uuid order, which is
// random between runs, so the pair is sorted after normalizing the ids.
function canonicalizeLinks(rows: Row[]): Row[] {
	for (const row of rows) {
		if (row.link_type !== "relates_to") {
			continue;
		}
		const source = String(row.source_task_id);
		const target = String(row.target_task_id);
		if (source > target) {
			row.source_task_id = target;
			row.target_task_id = source;
		}
	}
	return rows;
}

export function databaseIdentities(db: DatabaseSync): Map<string, string> {
	const read = (sql: string): Row[] =>
		db.prepare(sql).all() as unknown as Row[];
	return identitiesOf({
		tasks: read("SELECT id, key FROM tasks ORDER BY rowid"),
		task_attachments: read("SELECT id FROM task_attachments ORDER BY rowid"),
		task_comments: read("SELECT id FROM task_comments ORDER BY rowid"),
	});
}

export function readDatabase(
	db: DatabaseSync,
	options: NormalizerOptions = {},
): DatabaseDocument {
	const master = masterRows(db);
	const tables = master.filter((row) => row.type === "table");

	const columns: DatabaseDocument["columns"] = {};
	const raw: Record<string, Row[]> = {};
	for (const table of tables) {
		const tableColumnRows = tableColumns(db, table.name);
		columns[table.name] = tableColumnRows.map(
			({ name, type, notnull, dflt_value, pk }) => ({
				name,
				type,
				notnull,
				dflt_value,
				pk,
			}),
		);
		raw[table.name] = tableRows(db, table.name, tableColumnRows, table.sql);
	}

	const normalize = createNormalizer({
		...options,
		identities: identitiesOf(raw),
	});
	const rows: DatabaseDocument["rows"] = {};
	for (const table of tables) {
		const normalized = raw[table.name].map((row) => normalize(row));
		if (table.name === "task_links") {
			canonicalizeLinks(normalized);
		}
		if (/WITHOUT\s+ROWID/i.test(table.sql ?? "")) {
			normalized.sort((left, right) =>
				JSON.stringify(left).localeCompare(JSON.stringify(right)),
			);
		}
		rows[table.name] = normalized;
	}

	const hasSequence = master.some((row) => row.name === "sqlite_sequence");
	const sequences = hasSequence
		? (
				db
					.prepare("SELECT name, seq FROM sqlite_sequence ORDER BY name")
					.all() as unknown as { name: string; seq: number }[]
			).map(({ name, seq }) => ({ name, seq }))
		: [];

	return {
		schema: master.map(({ type, name, tbl_name, sql }) => ({
			type,
			name,
			tbl_name,
			sql,
		})),
		columns,
		sequences,
		rows,
	};
}
