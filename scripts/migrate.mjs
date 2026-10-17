import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Migrator } from "@ku6epxboctuk/sqlite-up";

const MIGRATIONS_TABLE = "schema_migrations";
const LOCK_TABLE = "schema_migrations_lock";

const command = process.argv[2] ?? "apply";
const dbPath =
	process.env.XBOCT_LOG_DB ?? join(homedir(), ".xboct-log", "xboct-log.db");
const migrationsDir =
	process.env.XBOCT_LOG_MIGRATIONS ?? join(process.cwd(), "migrations");

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

const migrator = new Migrator({ db, migrationsDir, fileExtensions: ["js"] });

function fail(error) {
	console.error(error);
	process.exit(1);
}

if (command === "apply") {
	const result = await migrator.apply();
	if (!result.success) {
		fail(result.error);
	}
	console.log(
		result.appliedMigrations.length > 0
			? `applied: ${result.appliedMigrations.join(", ")}`
			: "nothing to apply",
	);
} else if (command === "rollback") {
	const result = await migrator.rollback();
	if (!result.success) {
		fail(result.error);
	}
	console.log(
		result.appliedMigrations.length > 0
			? `rolled back: ${result.appliedMigrations.join(", ")}`
			: "nothing to roll back",
	);
} else if (command === "status") {
	const status = await migrator.status();
	for (const row of status.applied) {
		console.log(`batch ${row.batch}  ${row.name}  ${row.executed_at}`);
	}
	console.log(`current batch: ${status.currentBatch}`);
	console.log(`pending: ${status.pending}`);
} else if (command === "baseline") {
	const name = process.argv[3] ?? "001_init.js";
	await migrator.status();
	const recorded = db
		.prepare(`SELECT batch FROM ${MIGRATIONS_TABLE} WHERE name = ?`)
		.get(name);
	if (recorded) {
		console.log(`already recorded: ${name} (batch ${recorded.batch})`);
	} else {
		const { batch } = db
			.prepare(
				`SELECT COALESCE(MAX(batch), 0) + 1 AS batch FROM ${MIGRATIONS_TABLE}`,
			)
			.get();
		db.prepare(
			`INSERT INTO ${MIGRATIONS_TABLE} (name, executed_at, batch) VALUES (?, ?, ?)`,
		).run(name, new Date().toISOString(), batch);
		console.log(`baselined: ${name} (batch ${batch})`);
	}
} else if (command === "unlock") {
	db.prepare(`UPDATE ${LOCK_TABLE} SET locked = 0 WHERE id = 1`).run();
	console.log("lock released");
} else {
	console.error(`unknown command: ${command}`);
	console.error("usage: migrate.mjs [apply|rollback|status|baseline|unlock]");
	process.exit(1);
}

db.close();
