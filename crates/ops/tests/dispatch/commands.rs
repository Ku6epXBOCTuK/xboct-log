use super::*;

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

    let op = dispatch(&ctx, "activity_list", json!({ "op": "tasks_missing" }))
        .await
        .unwrap_err();
    assert_eq!(op.kind(), AppErrorKind::Validation);
    assert!(
        op.message().contains("unknown variant `tasks_missing`"),
        "{}",
        op.message()
    );
}

#[tokio::test]
async fn rejects_relationship_fields_in_update_many_items() {
    let ctx = context().await;
    let error = dispatch(
        &ctx,
        "tasks_update_many",
        json!({"items": [{"task_id": "LOG-1", "blocked_by": ["LOG-2"]}]}),
    )
    .await
    .unwrap_err();
    assert_eq!(error.kind(), AppErrorKind::Validation);
    assert!(
        error.message().contains("blocked_by"),
        "{}",
        error.message()
    );
    assert!(error.message().contains("items[0]"), "{}", error.message());
    assert!(
        error.message().contains("tasks_add_blocker"),
        "{}",
        error.message()
    );

    let alongside = dispatch(
        &ctx,
        "tasks_update_many",
        json!({"items": [{"task_id": "LOG-1", "status": "open", "blocked_by": ["LOG-2"]}]}),
    )
    .await
    .unwrap_err();
    assert_eq!(alongside.kind(), AppErrorKind::Validation);
    assert!(
        alongside.message().contains("blocked_by"),
        "{}",
        alongside.message()
    );
}

#[tokio::test]
async fn rejects_unknown_fields_in_a_nested_patch() {
    let ctx = context().await;
    let error = dispatch(
        &ctx,
        "tasks_update",
        json!({"task_id": "LOG-1", "patch": {"status": "open", "blocked_by": ["LOG-2"]}}),
    )
    .await
    .unwrap_err();
    assert_eq!(error.kind(), AppErrorKind::Validation);
    assert!(
        error.message().contains("blocked_by"),
        "{}",
        error.message()
    );
    assert!(
        error.message().contains("tasks_add_blocker"),
        "{}",
        error.message()
    );
}

#[tokio::test]
async fn updates_a_task_epic() {
    let ctx = context().await;
    sqlx::query("INSERT INTO projects (id, prefix, name, created_at) VALUES ('log', 'LOG', 'Log', '2026-01-01T00:00:00.000Z')")
        .execute(ctx.db.pool())
        .await
        .unwrap();
    let epic = dispatch(
        &ctx,
        "tasks_create",
        json!({"project_id": "log", "title": "Epic", "is_epic": true}),
    )
    .await
    .unwrap();
    let task = dispatch(
        &ctx,
        "tasks_create",
        json!({"project_id": "log", "title": "Task"}),
    )
    .await
    .unwrap();
    let epic_id = epic["id"].as_str().unwrap();
    let task_id = task["id"].as_str().unwrap();

    dispatch(
        &ctx,
        "tasks_update",
        json!({"task_id": task_id, "epic_id": epic_id}),
    )
    .await
    .unwrap();

    let updated = dispatch(&ctx, "tasks_get", json!({"task_id": task_id}))
        .await
        .unwrap();
    assert_eq!(updated["epic_id"].as_str(), Some(epic_id));
}

#[tokio::test]
async fn empty_input_accepts_empty_object_and_rejects_fields() {
    let ctx = context().await;
    dispatch(&ctx, "scopes_project_ids", json!({}))
        .await
        .unwrap();

    let field = dispatch(&ctx, "scopes_project_ids", json!({ "project_id": "log" }))
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
        Ok(xboct_log_core::ChangeEvent {
            seq: 1,
            entity: Entity::Tasks,
            op: "tasks_create".into(),
            source: ActivitySource::Ui,
            client: None,
        })
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

    let event = receiver.try_recv().unwrap();
    assert_eq!(event.client.as_deref(), Some("tab-7"));
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
#[tokio::test]
async fn records_attachment_activity_and_clears_it_on_restore() {
    let media = xboct_log_test_support::scratch_dir("dispatch-attachments");
    let ctx = media_context(&media).await;
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
    while receiver.try_recv().is_ok() {}

    let added = dispatch(
        &ctx,
        "attachments_add",
        json!({"task_id": "LOG-1", "filename": "note.txt", "content_base64": "aGVsbG8="}),
    )
    .await
    .expect("add");
    let id = added["item"]["id"].as_str().unwrap().to_string();
    let deleted = dispatch(&ctx, "attachments_delete", json!({"attachment_id": id}))
        .await
        .expect("delete");
    assert!(deleted["deleted_at"].is_string());
    let restored = dispatch(&ctx, "attachments_restore", json!({"attachment_id": id}))
        .await
        .expect("restore");
    assert_eq!(restored["deleted_at"], serde_json::Value::Null);

    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT op, changes FROM activity WHERE op LIKE 'attachments_%' ORDER BY id",
    )
    .fetch_all(ctx.db.pool())
    .await
    .unwrap();
    let ops: Vec<&str> = rows.iter().map(|row| row.0.as_str()).collect();
    assert_eq!(
        ops,
        vec![
            "attachments_add",
            "attachments_delete",
            "attachments_restore"
        ]
    );
    assert!(rows[0].1.contains("\"to\":\"note.txt\""), "{}", rows[0].1);
    assert!(rows[1].1.contains("\"from\":\"note.txt\""), "{}", rows[1].1);
    assert!(rows[2].1.contains("\"to\":\"note.txt\""), "{}", rows[2].1);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM activity")
            .fetch_one(ctx.db.pool())
            .await
            .unwrap(),
        4
    );
    let _ = std::fs::remove_dir_all(&media);
}

#[tokio::test]
async fn request_log_limits_follow_the_operation() {
    let ctx = context().await;

    dispatch(&ctx, "request_log_export", json!({"limit": 10000}))
        .await
        .expect("export accepts its maximum");
    dispatch(&ctx, "request_log_list", json!({"limit": 200}))
        .await
        .expect("list accepts its maximum");

    let export = dispatch(&ctx, "request_log_export", json!({"limit": 10001}))
        .await
        .unwrap_err();
    assert_eq!(export.kind(), AppErrorKind::Validation);
    assert_eq!(export.message(), "limit must be between 1 and 10000");

    let list = dispatch(&ctx, "request_log_list", json!({"limit": 201}))
        .await
        .unwrap_err();
    assert_eq!(list.kind(), AppErrorKind::Validation);
    assert_eq!(list.message(), "limit must be between 1 and 200");
}
