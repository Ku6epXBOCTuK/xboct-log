use serde_json::{Value, json};
use xboct_log_core::{
    AppErrorKind, Db, LinkFilter, NewTask, TaskFilters, TaskListEntry, TaskPatch, add_plan_item,
    count_epic_children_by_status, create_task, delete_task, get_task, list_tasks, move_task,
    resolve_task_id, update_task_detailed,
};

trait AsJson {
    fn as_json(&self) -> Value;
}

impl AsJson for TaskListEntry {
    fn as_json(&self) -> Value {
        serde_json::to_value(self).unwrap()
    }
}

async fn database() -> Db {
    let db = Db::open(":memory:").await.unwrap();
    db.migrate().await.unwrap();
    let pool = db.pool();
    for (id, name, prefix, archived) in [
        ("log", "Log", "LOG", None),
        ("spa", "Spa", "SPA", Some("2026-01-05T00:00:00.000Z")),
    ] {
        sqlx::query(
			"INSERT INTO projects (id, name, prefix, created_at, archived_at) VALUES (?, ?, ?, ?, ?)",
		)
		.bind(id)
		.bind(name)
		.bind(prefix)
		.bind("2026-01-01T00:00:00.000Z")
		.bind(archived)
		.execute(pool)
		.await
		.unwrap();
    }
    sqlx::query("INSERT INTO scopes (id, project_id, name, created_at) VALUES (1, 'log', 'backend', ?), (2, 'log', 'web', ?)")
		.bind("2026-01-01T00:00:00.000Z")
		.bind("2026-01-01T00:00:00.000Z")
		.execute(pool)
		.await
		.unwrap();
    for tag in ["bug", "docs"] {
        sqlx::query("INSERT INTO tags (name, created_at) VALUES (?, ?)")
            .bind(tag)
            .bind("2026-01-01T00:00:00.000Z")
            .execute(pool)
            .await
            .unwrap();
    }
    let tasks = [
        (
            "t1",
            "LOG-1",
            "log",
            1,
            "Rust port",
            "The rust rewrite epic",
            "open",
            "high",
            1,
            None,
            None,
            None,
            None,
            None,
            "2026-01-01T00:00:00.001Z",
            None,
            None,
            None,
        ),
        (
            "t2",
            "LOG-2",
            "log",
            2,
            "Port the tasks list",
            "## Heading\nSecond line with details",
            "backlog",
            "medium",
            0,
            Some("t1"),
            Some(1),
            Some("docs/rust-rewrite.md"),
            Some("Ivan"),
            Some("M"),
            "2026-01-01T00:00:00.002Z",
            Some("2026-12-01"),
            None,
            None,
        ),
        (
            "t3",
            "LOG-3",
            "log",
            3,
            "Write docs",
            "",
            "done",
            "low",
            0,
            Some("t1"),
            Some(2),
            None,
            None,
            None,
            "2026-01-01T00:00:00.003Z",
            None,
            Some("2026-01-01T00:00:00.003Z"),
            None,
        ),
        (
            "t4",
            "LOG-4",
            "log",
            4,
            "Third task",
            "Detailed body",
            "in-progress",
            "critical",
            0,
            None,
            None,
            None,
            None,
            Some("S"),
            "2026-01-01T00:00:00.004Z",
            None,
            None,
            None,
        ),
        (
            "t5",
            "LOG-5",
            "log",
            5,
            "Fifth task",
            "",
            "backlog",
            "low",
            0,
            None,
            None,
            None,
            None,
            None,
            "2026-01-01T00:00:00.002Z",
            None,
            None,
            None,
        ),
        (
            "t6",
            "SPA-2",
            "spa",
            2,
            "Second project",
            "",
            "open",
            "critical",
            0,
            None,
            None,
            None,
            None,
            None,
            "2026-01-01T00:00:00.005Z",
            None,
            None,
            None,
        ),
        (
            "t7",
            "SPA-1",
            "spa",
            1,
            "Deleted thing",
            "",
            "backlog",
            "low",
            0,
            None,
            None,
            None,
            None,
            None,
            "2026-01-01T00:00:00.000Z",
            None,
            None,
            Some("2026-01-02T00:00:00.000Z"),
        ),
    ];
    for (
        id,
        key,
        project,
        number,
        title,
        description,
        status,
        priority,
        is_epic,
        epic,
        scope,
        source,
        assignee,
        estimate,
        updated,
        due,
        closed,
        deleted,
    ) in tasks
    {
        sqlx::query(
			"INSERT INTO tasks (id, key, project_id, number, title, description, status, priority, is_epic, epic_id, scope_id, source_file, assignee, estimate, due_at, created_at, updated_at, closed_at, closed_reason, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		)
		.bind(id)
		.bind(key)
		.bind(project)
		.bind(number)
		.bind(title)
		.bind(description)
		.bind(status)
		.bind(priority)
		.bind(is_epic)
		.bind(epic)
		.bind(scope)
		.bind(source)
		.bind(assignee)
		.bind(estimate)
		.bind(due)
		.bind("2026-01-01T00:00:00.000Z")
		.bind(updated)
		.bind(closed)
		.bind(closed.map(|_| "fixed"))
		.bind(deleted)
		.execute(pool)
		.await
		.unwrap();
    }
    for (task, tag) in [("t2", "bug"), ("t2", "docs"), ("t3", "docs"), ("t4", "bug")] {
        sqlx::query("INSERT INTO task_tags (task_id, tag) VALUES (?, ?)")
            .bind(task)
            .bind(tag)
            .execute(pool)
            .await
            .unwrap();
    }
    for (source, target, link) in [
        ("t4", "t2", "blocks"),
        ("t1", "t3", "relates_to"),
        ("t4", "t1", "duplicates"),
    ] {
        sqlx::query(
			"INSERT INTO task_links (source_task_id, target_task_id, link_type, created_at) VALUES (?, ?, ?, ?)",
		)
		.bind(source)
		.bind(target)
		.bind(link)
		.bind("2026-01-01T00:00:00.000Z")
		.execute(pool)
		.await
		.unwrap();
    }
    db
}

fn filters(value: Value) -> TaskFilters {
    serde_json::from_value(value).unwrap()
}
async fn seed_plans(db: &Db) {
    for (id, name, deleted) in [
        ("p1", "Alpha", None),
        ("p2", "Beta", None),
        ("p3", "Gamma", Some("2026-01-02T00:00:00.000Z")),
    ] {
        sqlx::query(
            "INSERT INTO plans (id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id)
        .bind(name)
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .bind(deleted)
        .execute(db.pool())
        .await
        .unwrap();
    }
    for (plan, task, position) in [
        ("p1", "t1", 2048),
        ("p1", "t6", 1024),
        ("p1", "t3", 512),
        ("p2", "t1", 1024),
        ("p3", "t1", 512),
    ] {
        sqlx::query("INSERT INTO plan_items (plan_id, task_id, position) VALUES (?, ?, ?)")
            .bind(plan)
            .bind(task)
            .bind(position)
            .execute(db.pool())
            .await
            .unwrap();
    }
}

mod filters;
mod moves;
mod plans;
