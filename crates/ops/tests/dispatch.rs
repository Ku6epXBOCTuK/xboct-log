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
            "tasks_close"
        ]
    );
    assert!(ops.iter().all(|op| op.mcp));
    assert_eq!(ops[0].kind, Kind::Query);
    assert_eq!(ops[1].kind, Kind::Query);
    assert_eq!(ops[2].kind, Kind::Command);
    assert_eq!(ops[3].kind, Kind::Command);
    assert_eq!(ops[4].kind, Kind::Command);
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
