const CONFLICT_MESSAGE =
	"project prefix conflicts with an existing prefix (case-insensitive)";
const CASE_MESSAGE = "project prefix must be uppercase";

function foreignKeyViolations(db) {
	return db.prepare("PRAGMA foreign_key_check").all();
}

function assignPrefixes(projects) {
	const byLower = new Map();
	for (const project of projects) {
		const key = project.prefix.toLowerCase();
		const bucket = byLower.get(key) ?? [];
		bucket.push(project);
		byLower.set(key, bucket);
	}

	const taken = new Set(
		projects.map((project) => project.prefix.toLowerCase()),
	);
	const targets = new Map();

	for (const key of [...byLower.keys()].sort()) {
		const bucket = byLower.get(key);
		bucket.sort((a, b) => {
			const aUpper = a.prefix === a.prefix.toUpperCase() ? 0 : 1;
			const bUpper = b.prefix === b.prefix.toUpperCase() ? 0 : 1;
			if (aUpper !== bUpper) {
				return aUpper - bUpper;
			}
			if (a.created_at !== b.created_at) {
				return a.created_at < b.created_at ? -1 : 1;
			}
			return a.id < b.id ? -1 : 1;
		});

		const base = key.toUpperCase();
		for (const [index, project] of bucket.entries()) {
			let target = base;
			if (index > 0) {
				let suffix = 2;
				while (taken.has(`${base}${suffix}`.toLowerCase())) {
					suffix += 1;
				}
				target = `${base}${suffix}`;
			}
			taken.add(target.toLowerCase());
			targets.set(project.id, target);
		}
	}

	return targets;
}

function normalizePrefixes(db) {
	const projects = db
		.prepare("SELECT id, prefix, created_at FROM projects")
		.all()
		.map((row) => ({
			id: String(row.id),
			prefix: String(row.prefix),
			created_at: String(row.created_at),
		}));

	if (projects.length === 0) {
		return;
	}

	const targets = assignPrefixes(projects);
	const changed = projects.filter(
		(project) => targets.get(project.id) !== project.prefix,
	);
	if (changed.length === 0) {
		return;
	}

	const pairs = [];
	for (const project of changed) {
		const prefix = targets.get(project.id);
		const tasks = db
			.prepare("SELECT id, number FROM tasks WHERE project_id = ?")
			.all(project.id);
		for (const task of tasks) {
			const newId = `${prefix}-${task.number}`;
			if (String(task.id) !== newId) {
				pairs.push([String(task.id), newId]);
			}
		}
	}

	const violationsBefore = foreignKeyViolations(db).length;

	// NOTE: the migrator runs every migration inside one transaction, so
	// foreign keys have to be deferred instead of switched off.
	db.exec("PRAGMA defer_foreign_keys = ON;");
	db.exec(
		"CREATE TEMP TABLE prefix_id_map (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);",
	);
	const insertPair = db.prepare(
		"INSERT INTO prefix_id_map (old_id, new_id) VALUES (?, ?)",
	);
	for (const [oldId, newId] of pairs) {
		insertPair.run(oldId, newId);
	}

	db.exec(`
UPDATE tasks
SET epic_id = (SELECT new_id FROM prefix_id_map WHERE old_id = tasks.epic_id)
WHERE epic_id IN (SELECT old_id FROM prefix_id_map);

UPDATE task_blocked_by
SET blocked_task_id = (SELECT new_id FROM prefix_id_map WHERE old_id = task_blocked_by.blocked_task_id)
WHERE blocked_task_id IN (SELECT old_id FROM prefix_id_map);

UPDATE task_blocked_by
SET blocked_by_task_id = (SELECT new_id FROM prefix_id_map WHERE old_id = task_blocked_by.blocked_by_task_id)
WHERE blocked_by_task_id IN (SELECT old_id FROM prefix_id_map);

UPDATE activity
SET entity_id = (SELECT new_id FROM prefix_id_map WHERE old_id = activity.entity_id)
WHERE activity.entity = 'task' AND entity_id IN (SELECT old_id FROM prefix_id_map);

UPDATE activity
SET old_id = (SELECT new_id FROM prefix_id_map WHERE old_id = activity.old_id)
WHERE old_id IN (SELECT old_id FROM prefix_id_map);

UPDATE tasks
SET id = (SELECT new_id FROM prefix_id_map WHERE old_id = tasks.id)
WHERE id IN (SELECT old_id FROM prefix_id_map);
`);

	const updatePrefix = db.prepare(
		"UPDATE projects SET prefix = ? WHERE id = ?",
	);
	for (const project of changed) {
		updatePrefix.run(targets.get(project.id), project.id);
	}

	db.exec("DROP TABLE IF EXISTS prefix_id_map;");

	if (foreignKeyViolations(db).length > violationsBefore) {
		throw new Error("foreign key check failed after prefix normalization");
	}
}

export const up = (db) => {
	normalizePrefixes(db);

	db.exec(`
DROP TRIGGER IF EXISTS trg_projects_prefix_nocase_insert;
DROP TRIGGER IF EXISTS trg_projects_prefix_nocase_update;
DROP TRIGGER IF EXISTS trg_projects_prefix_upper_insert;
DROP TRIGGER IF EXISTS trg_projects_prefix_upper_update;

CREATE TRIGGER trg_projects_prefix_nocase_insert
BEFORE INSERT ON projects
WHEN EXISTS (
	SELECT 1 FROM projects WHERE lower(prefix) = lower(NEW.prefix)
)
BEGIN
	SELECT RAISE(ABORT, '${CONFLICT_MESSAGE}');
END;

CREATE TRIGGER trg_projects_prefix_nocase_update
BEFORE UPDATE OF prefix ON projects
WHEN EXISTS (
	SELECT 1 FROM projects WHERE id <> OLD.id AND lower(prefix) = lower(NEW.prefix)
)
BEGIN
	SELECT RAISE(ABORT, '${CONFLICT_MESSAGE}');
END;

CREATE TRIGGER trg_projects_prefix_upper_insert
BEFORE INSERT ON projects
WHEN NEW.prefix <> upper(NEW.prefix)
BEGIN
	SELECT RAISE(ABORT, '${CASE_MESSAGE}');
END;

CREATE TRIGGER trg_projects_prefix_upper_update
BEFORE UPDATE OF prefix ON projects
WHEN NEW.prefix <> upper(NEW.prefix)
BEGIN
	SELECT RAISE(ABORT, '${CASE_MESSAGE}');
END;
`);
};

export const down = (db) => {
	db.exec(`
DROP TRIGGER IF EXISTS trg_projects_prefix_nocase_insert;
DROP TRIGGER IF EXISTS trg_projects_prefix_nocase_update;
DROP TRIGGER IF EXISTS trg_projects_prefix_upper_insert;
DROP TRIGGER IF EXISTS trg_projects_prefix_upper_update;
`);
};
