use serde_json::{Value, json};
use xboct_log_core::{
    ClosedReason, Db, LinkType, NewTask, Status, TaskPatch, add_blocker, add_link, close_task,
    create_task, delete_task, get_task, move_task, remove_blocker, remove_link, restore_task,
    update_task,
};
async fn open() -> Db {
    let db = Db::open(":memory:").await.expect("open");
    db.migrate().await.expect("migrate");
    sqlx::query("INSERT INTO projects (id, prefix, name, created_at) VALUES ('log', 'LOG', 'Log', '2026-01-01T00:00:00.000Z')")
        .execute(db.pool())
        .await
        .expect("project");
    for tag in ["bug", "docs"] {
        sqlx::query("INSERT INTO tags (name, archived, created_at) VALUES (?, 0, '2026-01-01T00:00:00.000Z')")
            .bind(tag)
            .execute(db.pool())
            .await
            .expect("tag");
    }
    db
}

fn new_task(value: Value) -> NewTask {
    serde_json::from_value(value).expect("task input")
}

fn patch(value: Value) -> TaskPatch {
    serde_json::from_value(value).expect("patch")
}

#[tokio::test]
async fn creates_a_task_with_the_node_defaults() {
    let db = open().await;
    let created = create_task(
        &db,
        new_task(json!({
            "project_id": "log",
            "title": "  Port create  ",
            "tags": ["Bug", " bug ", "docs"],
            "estimate": "M",
            "due_at": "2026-12-01"
        })),
    )
    .await
    .expect("create");

    assert_eq!(created["id"], "LOG-1");
    assert_eq!(created["title"], "Port create");
    assert_eq!(created["status"], "backlog");
    assert_eq!(created["priority"], "medium");
    assert_eq!(created["number"], 1);
    assert_eq!(created["tags"], json!(["bug", "docs"]));
    assert_eq!(created["estimate"], "M");
    assert_eq!(created["due_at"], "2026-12-01");
    assert_eq!(created["warnings"], json!([]));
    assert_eq!(created["description"], "");
    assert!(created["epic_id"].is_null());
}

#[tokio::test]
async fn rejects_the_same_inputs_as_node() {
    let db = open().await;
    let missing_title = create_task(&db, new_task(json!({"project_id": "log", "title": "   "})))
        .await
        .expect_err("title");
    assert_eq!(missing_title.message(), "task title is required");

    let unknown_tag = create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "x", "tags": ["nope"]})),
    )
    .await
    .expect_err("tag");
    assert!(unknown_tag.message().starts_with("unknown tag(s): nope."));

    let bad_due = create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "x", "due_at": "tomorrow"})),
    )
    .await
    .expect_err("due");
    assert_eq!(bad_due.message(), "invalid due date: tomorrow");

    let blocked = create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "x", "blocked_reason": "wait"})),
    )
    .await
    .expect_err("blocked");
    assert_eq!(
        blocked.message(),
        "blocked_reason is only allowed on a blocked task"
    );
}

#[tokio::test]
async fn updates_fields_and_records_a_revision() {
    let db = open().await;
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "First", "description": "old body"})),
    )
    .await
    .expect("create");

    let updated = update_task(
        &db,
        "LOG-1",
        patch(json!({"status": "in-progress", "description": "new body", "priority": "high"})),
    )
    .await
    .expect("update");

    assert_eq!(updated["status"], "in-progress");
    assert_eq!(updated["priority"], "high");
    assert_eq!(updated["changes"][0]["field"], "status");
    assert_eq!(updated["warnings"], json!([]));

    let (body,): (String,) =
        sqlx::query_as("SELECT body FROM task_revisions WHERE field = 'description'")
            .fetch_one(db.pool())
            .await
            .expect("revision");
    assert_eq!(body, "old body");
}

#[tokio::test]
async fn rejects_an_empty_update() {
    let db = open().await;
    let error = update_task(&db, "LOG-1", patch(json!({})))
        .await
        .expect_err("empty");
    assert!(error.message().starts_with("nothing to update:"));
}

#[tokio::test]
async fn closes_a_task_and_releases_its_blocked_links() {
    let db = open().await;
    for title in ["blocker", "waiting"] {
        create_task(&db, new_task(json!({"project_id": "log", "title": title})))
            .await
            .expect("create");
    }
    update_task(&db, "LOG-2", patch(json!({"status": "blocked"})))
        .await
        .expect("block");
    sqlx::query(
        "INSERT INTO task_links (source_task_id, target_task_id, link_type, created_at) SELECT source.id, target.id, 'blocks', '2026-01-01T00:00:00.000Z' FROM tasks source, tasks target WHERE source.key = 'LOG-1' AND target.key = 'LOG-2'",
    )
    .execute(db.pool())
    .await
    .expect("link");

    let closed = close_task(&db, "LOG-1", ClosedReason::Fixed)
        .await
        .expect("close");
    assert_eq!(closed["status"], "done");
    assert_eq!(closed["closed_reason"], "fixed");
    assert!(closed["closed_at"].is_string());
    assert_eq!(closed["released"][0]["task_id"], "LOG-2");
    assert_eq!(closed["released"][0]["changes"][0]["to"], "backlog");

    let blocked = xboct_log_core::get_task(&db, "LOG-2").await.expect("read");
    assert_eq!(blocked.status, Status::Backlog);
}

#[tokio::test]
async fn closes_the_epic_after_its_last_child() {
    let db = open().await;
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "Epic", "is_epic": true})),
    )
    .await
    .expect("epic");
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "Child", "epic_id": "LOG-1"})),
    )
    .await
    .expect("child");

    let closed = close_task(&db, "LOG-2", ClosedReason::Fixed)
        .await
        .expect("close");
    assert_eq!(closed["closed_epic"]["id"], "LOG-1");
    assert_eq!(closed["closed_epic"]["status"], "done");

    let reopened = update_task(&db, "LOG-2", patch(json!({"status": "open"})))
        .await
        .expect("reopen");
    assert_eq!(reopened["reopened_epic"]["id"], "LOG-1");
    assert_eq!(reopened["reopened_epic"]["status"], "open");
}

#[tokio::test]
async fn refuses_to_demote_an_epic_with_children() {
    let db = open().await;
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "Epic", "is_epic": true})),
    )
    .await
    .expect("epic");
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "Child", "epic_id": "LOG-1"})),
    )
    .await
    .expect("child");

    let error = update_task(&db, "LOG-1", patch(json!({"is_epic": false})))
        .await
        .expect_err("demote");
    assert_eq!(
        error.message(),
        "cannot demote an epic with 1 subtask(s): detach or move them first"
    );
}

#[tokio::test]
async fn warns_about_a_blocked_task_without_a_reason() {
    let db = open().await;
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "Waiting", "status": "blocked"})),
    )
    .await
    .expect("create");

    let task = xboct_log_core::get_task(&db, "LOG-1").await.expect("read");
    assert_eq!(task.status, Status::Blocked);
    let updated = update_task(&db, "LOG-1", patch(json!({"priority": "high"})))
        .await
        .expect("update");
    assert_eq!(
        updated["warnings"][0],
        "task is blocked with no blocker task and no blocked_reason: say what or who it waits for, or add a blocker"
    );
}

#[tokio::test]
async fn deletes_releases_restores_and_moves() {
    let db = open().await;
    let blocker = create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "Blocker"})),
    )
    .await
    .expect("create blocker");
    let blocked = create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "Blocked"})),
    )
    .await
    .expect("create blocked");
    assert_eq!(blocker["id"], "LOG-1");
    assert_eq!(blocked["id"], "LOG-2");

    sqlx::query(
        "INSERT INTO task_links (source_task_id, target_task_id, link_type, created_at) SELECT source.id, target.id, 'blocks', '2026-01-01T00:00:00.000Z' FROM tasks source, tasks target WHERE source.key = 'LOG-1' AND target.key = 'LOG-2'",
    )
    .execute(db.pool())
    .await
    .expect("link");
    sqlx::query(
        "UPDATE tasks SET status = 'blocked', blocked_from_status = 'backlog', blocked_reason = 'wait' WHERE key = 'LOG-2'",
    )
    .execute(db.pool())
    .await
    .expect("block");

    let deleted = delete_task(&db, "LOG-1").await.expect("delete");
    assert_eq!(deleted["id"], "LOG-1");
    assert!(deleted["deleted_at"].is_string());
    assert_eq!(deleted["changes"][0]["field"], "deleted_at");
    assert_eq!(deleted["changes"][1]["field"], "blocked_by");
    assert_eq!(deleted["changes"][1]["from"], json!([]));
    assert_eq!(deleted["changes"][1]["to"], json!([]));
    assert_eq!(deleted["released"][0]["task_id"], "LOG-2");
    assert_eq!(deleted["released"][0]["changes"][1]["to"], "backlog");

    let released = get_task(&db, "LOG-2").await.expect("read blocked");
    assert_eq!(released.status, Status::Backlog);
    assert!(released.blocked_reason.is_none());

    let restored = restore_task(&db, "LOG-1").await.expect("restore");
    assert!(restored.deleted_at.is_none());
    let conflict = restore_task(&db, "LOG-1").await.expect_err("restore live");
    assert_eq!(conflict.message(), "task LOG-1 is not deleted");

    sqlx::query("INSERT INTO projects (id, prefix, name, created_at) VALUES ('spa', 'SPA', 'Spa', '2026-01-01T00:00:00.000Z')")
        .execute(db.pool())
        .await
        .expect("project");
    let moved = move_task(&db, "LOG-1", "spa").await.expect("move");
    assert_eq!(moved.id, "SPA-1");
    assert_eq!(moved.project_id, "spa");
    assert_eq!(moved.number.get(), 1);
}

#[tokio::test]
async fn detaches_epic_children_on_delete() {
    let db = open().await;
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "Epic", "is_epic": true})),
    )
    .await
    .expect("epic");
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "Child", "epic_id": "LOG-1"})),
    )
    .await
    .expect("child");

    let deleted = delete_task(&db, "LOG-1").await.expect("delete");
    let released = deleted["released"].as_array().expect("released");
    assert_eq!(released[0]["task_id"], "LOG-2");
    assert_eq!(released[0]["changes"][0]["field"], "epic_id");
    assert_eq!(released[0]["changes"][0]["to"], Value::Null);

    let child = get_task(&db, "LOG-2").await.expect("read child");
    assert!(child.epic_id.is_none());
}

#[tokio::test]
async fn links_tasks_and_releases_blockers() {
    let db = open().await;
    for title in ["One", "Two", "Three"] {
        create_task(&db, new_task(json!({"project_id": "log", "title": title})))
            .await
            .expect("create");
    }

    add_link(&db, LinkType::RelatesTo, "LOG-1", "LOG-2")
        .await
        .expect("relate");
    let first = get_task(&db, "LOG-1").await.expect("read first");
    assert_eq!(first.relates_to, vec!["LOG-2"]);
    let second = get_task(&db, "LOG-2").await.expect("read second");
    assert_eq!(second.relates_to, vec!["LOG-1"]);

    add_link(&db, LinkType::Duplicates, "LOG-1", "LOG-3")
        .await
        .expect("duplicate");
    let cycle = add_link(&db, LinkType::Duplicates, "LOG-3", "LOG-1")
        .await
        .expect_err("cycle");
    assert_eq!(
        cycle.message(),
        "duplicates cycle: LOG-1 already duplicates LOG-3"
    );

    let itself = add_link(&db, LinkType::RelatesTo, "LOG-1", "LOG-1")
        .await
        .expect_err("self");
    assert_eq!(itself.message(), "a task cannot relate to itself");

    update_task(&db, "LOG-1", patch(json!({"status": "blocked"})))
        .await
        .expect("block");
    add_blocker(&db, "LOG-1", "LOG-2").await.expect("blocker");
    let blocked = get_task(&db, "LOG-1").await.expect("read blocked");
    assert_eq!(blocked.blocked_by, vec!["LOG-2"]);

    remove_blocker(&db, "LOG-1", "LOG-2")
        .await
        .expect("release");
    let released = get_task(&db, "LOG-1").await.expect("read released");
    assert!(released.blocked_by.is_empty());
    assert_eq!(released.status, Status::Backlog);

    let missing = remove_link(&db, LinkType::RelatesTo, "LOG-1", "LOG-3")
        .await
        .expect_err("missing");
    assert_eq!(
        missing.message(),
        "no relates_to link between LOG-1 and LOG-3"
    );
}
