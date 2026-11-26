use super::*;

#[tokio::test]
async fn creates_a_task_with_the_node_defaults() {
    let db = open().await;
    let created = jsonv(
        create_task(
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
        .expect("create"),
    );

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
    let message = unknown_tag.message();
    assert!(message.starts_with("unknown tag(s): nope."), "{message}");
    assert!(message.contains("bug (0), docs (0) (2 total)"), "{message}");
    assert!(
        message.contains("tags_create {name: \"nope\"}"),
        "{message}"
    );

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
async fn suggests_an_existing_tag_for_a_near_miss() {
    let db = open().await;
    sqlx::query("INSERT INTO tags (name, archived, created_at) VALUES ('tests', 0, '2026-01-01T00:00:00.000Z')")
        .execute(db.pool())
        .await
        .expect("tag");

    let error = create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "x", "tags": ["test"]})),
    )
    .await
    .expect_err("tag");
    let message = error.message();
    assert!(
        message.contains("Did you mean 'tests' for 'test'?"),
        "{message}"
    );
    assert!(
        message.contains("tags_create {name: \"test\"}"),
        "{message}"
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

    let updated = jsonv(
        update_task(
            &db,
            "LOG-1",
            patch(json!({"status": "in-progress", "description": "new body", "priority": "high"})),
        )
        .await
        .expect("update"),
    );

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

    let closed = jsonv(
        close_task(&db, "LOG-1", ClosedReason::Fixed)
            .await
            .expect("close"),
    );
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

    let closed = jsonv(
        close_task(&db, "LOG-2", ClosedReason::Fixed)
            .await
            .expect("close"),
    );
    assert_eq!(closed["closed_epic"]["id"], "LOG-1");
    assert_eq!(closed["closed_epic"]["status"], "done");

    let reopened = jsonv(
        update_task(&db, "LOG-2", patch(json!({"status": "open"})))
            .await
            .expect("reopen"),
    );
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
    let updated = jsonv(
        update_task(&db, "LOG-1", patch(json!({"priority": "high"})))
            .await
            .expect("update"),
    );
    assert_eq!(
        updated["warnings"][0],
        "task is blocked with no blocker task and no blocked_reason: say what or who it waits for, or add a blocker"
    );
}

#[tokio::test]
async fn deletes_releases_restores_and_moves() {
    let db = open().await;
    let blocker = jsonv(
        create_task(
            &db,
            new_task(json!({"project_id": "log", "title": "Blocker"})),
        )
        .await
        .expect("create blocker"),
    );
    let blocked = jsonv(
        create_task(
            &db,
            new_task(json!({"project_id": "log", "title": "Blocked"})),
        )
        .await
        .expect("create blocked"),
    );
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

    let deleted = jsonv(delete_task(&db, "LOG-1").await.expect("delete"));
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

    let deleted = jsonv(delete_task(&db, "LOG-1").await.expect("delete"));
    let released = deleted["released"].as_array().expect("released");
    assert_eq!(released[0]["task_id"], "LOG-2");
    assert_eq!(released[0]["changes"][0]["field"], "epic_id");
    assert_eq!(released[0]["changes"][0]["to"], Value::Null);

    let child = get_task(&db, "LOG-2").await.expect("read child");
    assert!(child.epic_id.is_none());
}
