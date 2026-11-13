use std::sync::Arc;

use serde_json::json;
use xboct_log_core::{AppErrorKind, Db, Events};
use xboct_log_ops::{Ctx, Kind, dispatch, metadata};

async fn context() -> Ctx {
    let db = Db::open(":memory:").await.unwrap();
    db.migrate().await.unwrap();
    Ctx {
        db: Arc::new(db),
        events: Arc::new(Events::new()),
    }
}

#[test]
fn lists_the_registered_operations() {
    let ops = metadata();
    let names: Vec<&str> = ops.iter().map(|op| op.name).collect();
    assert_eq!(
        names,
        vec![
            "tasks_list",
            "tasks_get",
            "tasks_create",
            "tasks_update",
            "tasks_close",
            "tasks_delete",
            "tasks_restore",
            "tasks_move",
            "tasks_create_many",
            "tasks_update_many",
            "tasks_close_many"
        ]
    );
    assert!(ops.iter().all(|op| op.mcp));
    assert_eq!(ops[0].kind, Kind::Query);
    assert_eq!(ops[1].kind, Kind::Query);
    assert!(ops[2..].iter().all(|op| op.kind == Kind::Command));
    assert!(ops[0].description.starts_with("List tasks with filters"));
    assert!(ops[1].description.starts_with("Get a single task"));
    assert!(ops[2].description.starts_with("Create a task"));
    assert!(
        ops[3]
            .description
            .starts_with("Update fields of an existing task")
    );
    assert!(ops[4].description.starts_with("Close a task"));
}

#[tokio::test]
async fn dispatches_a_task_list() {
    let ctx = context().await;
    let output = dispatch(&ctx, "tasks_list", json!({ "limit": 5 }))
        .await
        .unwrap();
    assert_eq!(output["total"], 0);
    assert_eq!(output["items"], json!([]));
}

#[tokio::test]
async fn dispatches_a_task_get_error() {
    let ctx = context().await;
    let error = dispatch(&ctx, "tasks_get", json!({ "task_id": "LOG-1" }))
        .await
        .unwrap_err();
    assert_eq!(error.kind(), AppErrorKind::NotFound);
    assert_eq!(error.message(), "task LOG-1 not found");
}

#[tokio::test]
async fn rejects_unknown_operations_and_fields() {
    let ctx = context().await;
    let unknown = dispatch(&ctx, "tasks_missing", json!({}))
        .await
        .unwrap_err();
    assert_eq!(unknown.kind(), AppErrorKind::NotFound);
    assert_eq!(unknown.message(), "no operation named tasks_missing");

    let field = dispatch(&ctx, "tasks_list", json!({ "titel": "rust" }))
        .await
        .unwrap_err();
    assert_eq!(field.kind(), AppErrorKind::Validation);
    assert!(
        field.message().contains("unknown field"),
        "{}",
        field.message()
    );
}

#[tokio::test]
async fn runs_a_batch_and_reports_each_item() {
    let ctx = context().await;
    sqlx::query("INSERT INTO projects (id, prefix, name, created_at) VALUES ('log', 'LOG', 'Log', '2026-01-01T00:00:00.000Z')")
        .execute(ctx.db.pool())
        .await
        .unwrap();

    let created = dispatch(
        &ctx,
        "tasks_create_many",
        json!({"items": [
            {"project_id": "log", "title": "First"},
            {"project_id": "log", "title": "Second"},
            {"project_id": "ghost", "title": "Third"}
        ]}),
    )
    .await
    .expect("create many");
    assert_eq!(created["succeeded"], 2);
    assert_eq!(created["failed"], 1);
    assert_eq!(created["items"][0]["task"]["id"], "LOG-1");
    assert_eq!(created["items"][1]["task"]["id"], "LOG-2");
    assert_eq!(created["items"][2]["ok"], false);
    assert_eq!(created["items"][2]["id"], serde_json::Value::Null);
    assert_eq!(created["items"][2]["error"]["kind"], "not_found");

    let updated = dispatch(
        &ctx,
        "tasks_update_many",
        json!({"items": [{"task_id": "LOG-1", "status": "in-progress"}]}),
    )
    .await
    .expect("update many");
    assert_eq!(updated["items"][0]["task"]["status"], "in-progress");

    let closed = dispatch(
        &ctx,
        "tasks_close_many",
        json!({"items": [
            {"task_id": "LOG-1", "reason": "fixed"},
            {"task_id": "LOG-404", "reason": "fixed"}
        ]}),
    )
    .await
    .expect("close many");
    assert_eq!(closed["items"][0]["task"]["status"], "done");
    assert_eq!(closed["items"][1]["ok"], false);
}
