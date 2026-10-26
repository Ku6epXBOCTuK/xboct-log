import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Migrator } from "@ku6epxboctuk/sqlite-up";
import { openDatabase } from "./db";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");
const INTERNAL_TABLES = ["schema_migrations", "schema_migrations_lock"];

const tempDirs = new Set<string>();

interface SchemaColumn {
	name: string;
	type: string;
	notNull: number;
	defaultValue: unknown;
	primaryKey: number;
}

interface SchemaForeignKey {
	table: string;
	from: string;
	to: string | null;
	onUpdate: string;
	onDelete: string;
}

interface SchemaTable {
	name: string;
	columns: SchemaColumn[];
	foreignKeys: SchemaForeignKey[];
}

interface SchemaIndex {
	name: string;
	unique: number;
	partial: number;
	columns: string[];
	sql: string | null;
}

interface SchemaTrigger {
	name: string;
	sql: string;
}

export interface SchemaDescription {
	tables: SchemaTable[];
	indexes: SchemaIndex[];
	triggers: SchemaTrigger[];
}

export function migrationNames(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((name) => name.endsWith(".js"))
		.sort();
}

function copyMigrations(names: string[]): string {
	const dir = mkdtempSync(join(tmpdir(), "xboct-log-migrations-"));
	tempDirs.add(dir);
	for (const name of names) {
		copyFileSync(join(MIGRATIONS_DIR, name), join(dir, name));
	}
	return dir;
}

function createMigrator(db: DatabaseSync, names: string[]): Migrator {
	return new Migrator({
		db,
		migrationsDir: copyMigrations(names),
		fileExtensions: ["js"],
	});
}

export async function applyMigrations(
	db: DatabaseSync,
	names: string[],
): Promise<void> {
	const result = await createMigrator(db, names).apply();
	if (!result.success) {
		throw result.error ?? new Error("migration failed");
	}
}

export async function rollbackLast(
	db: DatabaseSync,
	names: string[],
): Promise<void> {
	const result = await createMigrator(db, names).rollback();
	if (!result.success) {
		throw result.error ?? new Error("rollback failed");
	}
}

export async function pendingMigrations(
	db: DatabaseSync,
	names: string[],
): Promise<number> {
	return (await createMigrator(db, names).status()).pending;
}

export function createDb(): DatabaseSync {
	return openDatabase(":memory:");
}

export function cleanupMigrationDirs(): void {
	for (const dir of tempDirs) {
		rmSync(dir, { recursive: true, force: true });
	}
	tempDirs.clear();
}

function quoteIdentifier(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

function normalizeSql(sql: string | null): string | null {
	return sql === null ? null : sql.replace(/\s+/g, " ").trim();
}

function describeTable(db: DatabaseSync, name: string): SchemaTable {
	const columns = db
		.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`)
		.all()
		.map((row) => ({
			name: String(row.name),
			type: String(row.type),
			notNull: Number(row.notnull),
			defaultValue: row.dflt_value ?? null,
			primaryKey: Number(row.pk),
		}));

	const foreignKeys = db
		.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(name)})`)
		.all()
		.map((row) => ({
			table: String(row.table),
			from: String(row.from),
			to: row.to === null ? null : String(row.to),
			onUpdate: String(row.on_update),
			onDelete: String(row.on_delete),
		}))
		.sort((a, b) =>
			`${a.from}:${a.table}:${a.to}`.localeCompare(
				`${b.from}:${b.table}:${b.to}`,
			),
		);

	return { name, columns, foreignKeys };
}

function describeIndexes(db: DatabaseSync): SchemaIndex[] {
	const tables = db
		.prepare(
			`SELECT name FROM sqlite_master
			  WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
		)
		.all()
		.map((row) => String(row.name));

	const indexes: SchemaIndex[] = [];
	for (const table of tables) {
		const rows = db
			.prepare(`PRAGMA index_list(${quoteIdentifier(table)})`)
			.all();
		for (const row of rows) {
			const name = String(row.name);
			if (name.startsWith("sqlite_autoindex_")) continue;
			const columns = db
				.prepare(`PRAGMA index_info(${quoteIdentifier(name)})`)
				.all()
				.sort((a, b) => Number(a.seqno) - Number(b.seqno))
				.map((column) => String(column.name));
			const stored = db
				.prepare("SELECT sql FROM sqlite_master WHERE name = ?")
				.get(name);
			const sql = stored === undefined ? null : stored.sql;
			indexes.push({
				name,
				unique: Number(row.unique),
				partial: Number(row.partial),
				columns,
				sql: normalizeSql(typeof sql === "string" ? sql : null),
			});
		}
	}

	return indexes.sort((a, b) => a.name.localeCompare(b.name));
}

function describeTriggers(db: DatabaseSync): SchemaTrigger[] {
	return db
		.prepare(
			`SELECT name, sql FROM sqlite_master
			  WHERE type = 'trigger' AND name NOT LIKE 'sqlite_%'`,
		)
		.all()
		.map((row) => ({
			name: String(row.name),
			sql: normalizeSql(String(row.sql)) ?? "",
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function describeSchema(db: DatabaseSync): SchemaDescription {
	const placeholders = INTERNAL_TABLES.map(() => "?").join(", ");
	const tables = db
		.prepare(
			`SELECT name FROM sqlite_master
			  WHERE type = 'table'
			    AND name NOT LIKE 'sqlite_%'
			    AND name NOT IN (${placeholders})
			  ORDER BY name`,
		)
		.all(...INTERNAL_TABLES)
		.map((row) => describeTable(db, String(row.name)));

	return {
		tables,
		indexes: describeIndexes(db),
		triggers: describeTriggers(db),
	};
}
