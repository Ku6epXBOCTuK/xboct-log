use std::sync::Arc;

use serde_json::json;
use xboct_log_core::{Config, Db, Events};
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
async fn document_ops_keep_revisions_cross_project_links_and_soft_delete() {
    let ctx = context().await;
    let first = call(
        &ctx,
        "documents_create",
        json!({
            "project_id": "log",
            "kind": "adr",
            "title": "Use sqlite",
            "body": "first body",
            "source_file": "docs/adr/001.md"
        }),
    )
    .await;
    assert_eq!(first["key"], "LOG-1");
    assert_eq!(first["status"], "draft");
    let first_id = first["id"].as_str().unwrap();
    let updated_at = first["updated_at"].as_str().unwrap();

    let second = call(
        &ctx,
        "documents_create",
        json!({"project_id": "spa", "kind": "spec", "title": "Import", "body": "second body"}),
    )
    .await;
    assert_eq!(second["key"], "SPA-1");
    let second_id = second["id"].as_str().unwrap();

    let listed = call(&ctx, "documents_list", json!({"project_id": "log"})).await;
    assert_eq!(listed["items"].as_array().unwrap().len(), 1);
    let all = call(&ctx, "documents_list", json!({})).await;
    assert_eq!(all["items"].as_array().unwrap().len(), 2);

    let stale = dispatch(
        &ctx,
        "documents_update",
        json!({
            "document_id": first_id,
            "body": "lost body",
            "expected_updated_at": "stale"
        }),
    )
    .await;
    assert!(stale.is_err());

    let edited = call(
        &ctx,
        "documents_update",
        json!({
            "document_id": first_id,
            "body": "second version",
            "status": "accepted",
            "expected_updated_at": updated_at
        }),
    )
    .await;
    assert_eq!(edited["body"], "second version");
    assert_eq!(edited["status"], "accepted");
    assert!(edited["closed_at"].is_string());
    let revisions = call(
        &ctx,
        "documents_revisions_list",
        json!({"document_id": first_id}),
    )
    .await;
    assert_eq!(revisions["items"][0]["body"], "first body");

    let plan = call(&ctx, "plans_create", json!({"name": "Docs roadmap"})).await;
    let plan_id = plan["id"].as_str().unwrap();
    call(
        &ctx,
        "plans_documents_link",
        json!({"plan_id": plan_id, "document_id": first_id}),
    )
    .await;
    call(
        &ctx,
        "plans_documents_link",
        json!({"plan_id": plan_id, "document_id": second_id}),
    )
    .await;
    let linked = call(&ctx, "plans_documents_list", json!({"plan_id": plan_id})).await;
    assert_eq!(linked["items"].as_array().unwrap().len(), 2);

    call(
        &ctx,
        "plans_documents_unlink",
        json!({"plan_id": plan_id, "document_id": first_id}),
    )
    .await;
    let linked = call(&ctx, "plans_documents_list", json!({"plan_id": plan_id})).await;
    assert_eq!(linked["items"].as_array().unwrap().len(), 1);
    assert_eq!(linked["items"][0]["id"], second_id);

    call(&ctx, "documents_delete", json!({"document_id": second_id})).await;
    let all = call(&ctx, "documents_list", json!({})).await;
    assert_eq!(all["items"].as_array().unwrap().len(), 1);
    let deleted = call(&ctx, "documents_deleted_list", json!({})).await;
    assert_eq!(deleted["items"][0]["id"], second_id);
    call(&ctx, "documents_restore", json!({"document_id": second_id})).await;
    let all = call(&ctx, "documents_list", json!({})).await;
    assert_eq!(all["items"].as_array().unwrap().len(), 2);
}
