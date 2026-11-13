use std::sync::Arc;

use serde_json::json;
use xboct_log_core::{ActivitySource, AppErrorKind, Config, Db, Entity, Events, ServerEvent};
use xboct_log_ops::{Ctx, Kind, dispatch, metadata};

async fn context() -> Ctx {
    let db = Db::open(":memory:").await.unwrap();
    db.migrate().await.unwrap();
    let config =
        Config::from_lookup(|name| (name == "XBOCT_LOG_DB").then(|| ":memory:".to_string()))
            .expect("config");
    Ctx::new(Arc::new(db), Arc::new(Events::new()), Arc::new(config))
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
            "tasks_add_link",
            "tasks_remove_link",
            "tasks_add_blocker",
            "tasks_remove_blocker",
            "tasks_create_many",
            "tasks_update_many",
            "tasks_options",
            "tasks_stats",
            "tasks_revisions_list",
            "tasks_deleted_list",
            "tasks_get_many",
            "tasks_close_many",
            "tasks_history",
            "activity_list"
        ]
    );
    assert!(ops.iter().all(|op| op.mcp));
    assert_eq!(ops[0].kind, Kind::Query);
    assert_eq!(ops[1].kind, Kind::Query);
    assert_eq!(ops[14].kind, Kind::Query);
    assert_eq!(ops[15].kind, Kind::Query);
    assert_eq!(ops[16].kind, Kind::Query);
    assert_eq!(ops[17].kind, Kind::Query);
    assert_eq!(ops[18].kind, Kind::Query);
    assert_eq!(ops[19].kind, Kind::Command);
    assert_eq!(ops[20].kind, Kind::Query);
    assert_eq!(ops[21].kind, Kind::Query);
    assert!(ops[0].description.starts_with("List tasks with filters"));
    assert!(ops[1].description.starts_with("Get a single task"));
    assert!(ops[2].description.starts_with("Create a task"));
    assert!(
        ops[3]
            .description
            .starts_with("Update fields of an existing task")
    );
    assert!(ops[4].description.starts_with("Close a task"));
    assert!(
        ops[8]
            .description
            .starts_with("Add a typed link between two tasks")
    );
    assert!(ops[10].description.starts_with("Link two tasks"));
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
async fn records_activity_and_publishes_a_change_for_commands() {
    let ctx = context().await;
    let mut receiver = ctx.events.subscribe();
    sqlx::query("INSERT INTO projects (id, prefix, name, created_at) VALUES ('log', 'LOG', 'Log', '2026-01-01T00:00:00.000Z')")
        .execute(ctx.db.pool())
        .await
        .unwrap();

    sqlx::query("INSERT INTO tags (name, archived, created_at) VALUES ('api', 0, '2026-01-01T00:00:00.000Z')")
        .execute(ctx.db.pool())
        .await
        .unwrap();

    let created = dispatch(
        &ctx,
        "tasks_create",
        json!({"project_id": "log", "title": "First", "status": "open", "tags": ["api"]}),
    )
    .await
    .unwrap();
    let task_id = created["id"].as_str().unwrap().to_string();

    assert_eq!(
        receiver.try_recv(),
        Ok(ServerEvent::Change(xboct_log_core::ChangeEvent {
            seq: 1,
            entity: Entity::Tasks,
            op: "tasks_create".into(),
            source: ActivitySource::Ui,
            client: None,
        }))
    );

    let row: (String, String, String, String, String, String) = sqlx::query_as(
        "SELECT source, op, entity, entity_id, entity_task_id, fields FROM activity",
    )
    .fetch_one(ctx.db.pool())
    .await
    .unwrap();
    assert_eq!(row.0, "ui");
    assert_eq!(row.1, "tasks_create");
    assert_eq!(row.2, "task");
    assert_eq!(row.3, task_id);
    assert!(
        !row.4.is_empty(),
        "entity_task_id is resolved from the task key"
    );
    assert_eq!(row.5, r#"["status","tags"]"#);

    dispatch(&ctx, "tasks_list", json!({})).await.unwrap();
    assert_eq!(
        receiver.try_recv(),
        Err(tokio::sync::broadcast::error::TryRecvError::Empty)
    );
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM activity")
        .fetch_one(ctx.db.pool())
        .await
        .unwrap();
    assert_eq!(count, 1);

    let failed = dispatch(
        &ctx,
        "tasks_close",
        json!({"task_id": "LOG-404", "reason": "fixed"}),
    )
    .await
    .unwrap_err();
    assert_eq!(failed.kind(), AppErrorKind::NotFound);
    assert_eq!(
        receiver.try_recv(),
        Err(tokio::sync::broadcast::error::TryRecvError::Empty)
    );
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM activity")
        .fetch_one(ctx.db.pool())
        .await
        .unwrap();
    assert_eq!(count, 1);
}

#[tokio::test]
async fn keeps_the_client_of_the_call_on_the_change() {
    let ctx = context().await.with_client(Some("tab-7".to_string()));
    let mut receiver = ctx.events.subscribe();
    sqlx::query("INSERT INTO projects (id, prefix, name, created_at) VALUES ('log', 'LOG', 'Log', '2026-01-01T00:00:00.000Z')")
        .execute(ctx.db.pool())
        .await
        .unwrap();

    dispatch(
        &ctx,
        "tasks_create",
        json!({"project_id": "log", "title": "First"}),
    )
    .await
    .unwrap();

    match receiver.try_recv().unwrap() {
        ServerEvent::Change(event) => assert_eq!(event.client.as_deref(), Some("tab-7")),
        ServerEvent::Reset => panic!("expected a change"),
    }
    let client: Option<String> = sqlx::query_scalar("SELECT client FROM activity")
        .fetch_one(ctx.db.pool())
        .await
        .unwrap();
    assert_eq!(client.as_deref(), Some("tab-7"));
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
