use std::sync::Arc;

use serde_json::json;
use xboct_log_core::{Config, Db, Events, delete_task, move_task};
use xboct_log_ops::{Ctx, dispatch};

async fn context() -> Ctx {
    let db = Db::open(":memory:").await.unwrap();
    db.migrate().await.unwrap();
    for (id, prefix) in [("log", "LOG"), ("spa", "SPA")] {
        sqlx::query(
            "INSERT INTO projects (id, prefix, name, created_at) VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z')",
        )
        .bind(id)
        .bind(prefix)
        .bind(id)
        .execute(db.pool())
        .await
        .unwrap();
    }
    for (key, project, number) in [("LOG-1", "log", 1), ("SPA-1", "spa", 1)] {
        sqlx::query(
            "INSERT INTO tasks (id, project_id, number, is_epic, key, title, status, priority, created_at, updated_at)
             VALUES (?, ?, ?, 0, ?, 'task', 'backlog', 'medium', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .bind(key)
        .bind(project)
        .bind(number)
        .bind(key)
        .execute(db.pool())
        .await
        .unwrap();
    }
    let config =
        Config::from_lookup(|name| (name == "XBOCT_LOG_DB").then(|| ":memory:".to_string()))
            .expect("config");
    Ctx::new(Arc::new(db), Arc::new(Events::new()), Arc::new(config))
}

async fn call(ctx: &Ctx, op: &str, input: serde_json::Value) -> serde_json::Value {
    dispatch(ctx, op, input)
        .await
        .unwrap_or_else(|error| panic!("{op}: {error}"))
}

#[tokio::test]
async fn plan_ops_keep_mixed_items_and_notes_across_moves() {
    let ctx = context().await;
    let plan = call(
        &ctx,
        "plans_create",
        json!({"name": "Roadmap", "status": "active"}),
    )
    .await;
    let plan_id = plan["id"].as_str().unwrap();

    call(
        &ctx,
        "plans_items_add",
        json!({"plan_id": plan_id, "task_id": "LOG-1"}),
    )
    .await;
    call(
        &ctx,
        "plans_items_add",
        json!({"plan_id": plan_id, "task_id": "SPA-1"}),
    )
    .await;
    let listed = call(&ctx, "plans_list", json!({})).await;
    assert_eq!(listed["items"][0]["tasks_count"], 2);

    let reordered = call(
        &ctx,
        "plans_reorder",
        json!({"plan_id": plan_id, "task_ids": ["SPA-1", "LOG-1"]}),
    )
    .await;
    assert_eq!(reordered["items"][0]["key"], "SPA-1");
    assert_eq!(reordered["items"][1]["key"], "LOG-1");

    let note = call(
        &ctx,
        "plans_notes_add",
        json!({"plan_id": plan_id, "task_id": "LOG-1", "body": "first"}),
    )
    .await;
    let note_id = note["id"].as_str().unwrap();
    call(
        &ctx,
        "plans_notes_edit",
        json!({"note_id": note_id, "body": "second"}),
    )
    .await;
    let notes = call(&ctx, "plans_notes_list", json!({"plan_id": plan_id})).await;
    assert_eq!(notes["items"][0]["body"], "second");

    let moved = move_task(&ctx.db, "LOG-1", "spa").await.expect("move");
    assert_eq!(moved.id.as_str(), "SPA-2");
    let items = call(
        &ctx,
        "plans_reorder",
        json!({"plan_id": plan_id, "task_ids": ["SPA-1", "SPA-2"]}),
    )
    .await;
    assert_eq!(items["items"][1]["key"], "SPA-2");
    let notes = call(&ctx, "plans_notes_list", json!({"plan_id": plan_id})).await;
    assert_eq!(notes["items"][0]["key"], "SPA-2");

    delete_task(&ctx.db, "SPA-2").await.expect("delete task");
    let stored = call(&ctx, "plans_get", json!({"plan_id": plan_id})).await;
    assert_eq!(stored["tasks_count"], 1);

    call(&ctx, "plans_delete", json!({"plan_id": plan_id})).await;
    assert_eq!(
        call(&ctx, "plans_list", json!({})).await["items"]
            .as_array()
            .unwrap()
            .len(),
        0
    );
    assert_eq!(
        call(&ctx, "plans_deleted_list", json!({})).await["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    call(&ctx, "plans_restore", json!({"plan_id": plan_id})).await;
    assert_eq!(
        call(&ctx, "plans_list", json!({})).await["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let notes = call(&ctx, "plans_notes_list", json!({"plan_id": plan_id})).await;
    assert_eq!(notes["items"][0]["key"], "SPA-2");
}
