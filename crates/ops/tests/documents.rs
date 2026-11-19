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

#[tokio::test]
async fn document_ops_accept_keys_as_well_as_ids() {
    let ctx = context().await;
    let created = call(
        &ctx,
        "documents_create",
        json!({"project_id": "log", "kind": "adr", "title": "ADR", "body": "first"}),
    )
    .await;
    let id = created["id"].as_str().unwrap();
    assert_eq!(created["key"], "LOG-1");

    let got = call(&ctx, "documents_get", json!({"document_id": "LOG-1"})).await;
    assert_eq!(got["id"], id);
    let got = call(&ctx, "documents_get", json!({"document_id": id})).await;
    assert_eq!(got["key"], "LOG-1");
    assert!(
        dispatch(&ctx, "documents_get", json!({"document_id": "1"}))
            .await
            .is_err()
    );

    call(
        &ctx,
        "documents_update",
        json!({"document_id": "log-1", "body": "second"}),
    )
    .await;
    let revisions = call(
        &ctx,
        "documents_revisions_list",
        json!({"document_id": "LOG-1"}),
    )
    .await;
    assert_eq!(revisions["items"][0]["body"], "first");
    assert_eq!(revisions["items"][0]["entity_id"], id);

    let plan = call(&ctx, "plans_create", json!({"name": "Docs"})).await;
    let plan_id = plan["id"].as_str().unwrap();
    call(
        &ctx,
        "plans_documents_link",
        json!({"plan_id": plan_id, "document_id": "LOG-1"}),
    )
    .await;
    let linked = call(&ctx, "plans_documents_list", json!({"plan_id": plan_id})).await;
    assert_eq!(linked["items"][0]["id"], id);
    call(
        &ctx,
        "plans_documents_unlink",
        json!({"plan_id": plan_id, "document_id": id}),
    )
    .await;
    let linked = call(&ctx, "plans_documents_list", json!({"plan_id": plan_id})).await;
    assert_eq!(linked["items"].as_array().unwrap().len(), 0);

    call(&ctx, "documents_delete", json!({"document_id": "LOG-1"})).await;
    call(&ctx, "documents_restore", json!({"document_id": "LOG-1"})).await;
    let got = call(&ctx, "documents_get", json!({"document_id": "LOG-1"})).await;
    assert!(got["deleted_at"].is_null());
}

#[tokio::test]
async fn document_list_ops_return_totals_previews_and_plan_scope() {
    let ctx = context().await;
    let first = call(
        &ctx,
        "documents_create",
        json!({"project_id": "log", "kind": "adr", "title": "First", "body": "intro\nnext"}),
    )
    .await;
    let first_id = first["id"].as_str().unwrap();
    let second = call(
        &ctx,
        "documents_create",
        json!({"project_id": "spa", "kind": "spec", "title": "Second", "body": "other"}),
    )
    .await;
    let second_id = second["id"].as_str().unwrap();

    let listed = call(&ctx, "documents_list", json!({})).await;
    assert_eq!(listed["total"], 2);
    assert_eq!(listed["items"][0]["short_body"], "intro");
    assert!(listed["items"][0].get("body").is_none());

    let full = call(
        &ctx,
        "documents_list",
        json!({"include_body": true, "fields": ["id", "body"], "limit": 1}),
    )
    .await;
    assert_eq!(full["total"], 2);
    assert_eq!(full["items"].as_array().unwrap().len(), 1);
    assert_eq!(full["items"][0]["body"], "intro\nnext");
    assert!(full["items"][0].get("title").is_none());

    let plan = call(&ctx, "plans_create", json!({"name": "Docs"})).await;
    let plan_id = plan["id"].as_str().unwrap();
    call(
        &ctx,
        "plans_documents_link",
        json!({"plan_id": plan_id, "document_id": second_id}),
    )
    .await;
    let linked = call(
        &ctx,
        "plans_documents_list",
        json!({"plan_id": plan_id, "include_body": true}),
    )
    .await;
    assert_eq!(linked["total"], 1);
    assert_eq!(linked["items"][0]["id"], second_id);
    assert_eq!(linked["items"][0]["body"], "other");

    call(&ctx, "documents_delete", json!({"document_id": second_id})).await;
    assert_eq!(call(&ctx, "documents_list", json!({})).await["total"], 1);
    assert_eq!(
        call(
            &ctx,
            "documents_list",
            json!({"include_deleted": true, "fields": "id,key,deleted_at"})
        )
        .await["total"],
        2
    );

    assert_eq!(
        call(&ctx, "plans_list", json!({})).await["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    call(&ctx, "plans_delete", json!({"plan_id": plan_id})).await;
    assert_eq!(
        call(&ctx, "plans_list", json!({})).await["items"]
            .as_array()
            .unwrap()
            .len(),
        0
    );
    assert_eq!(
        call(&ctx, "plans_list", json!({"include_deleted": true})).await["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );

    let _ = first_id;
}

#[tokio::test]
async fn document_list_ops_filter_kind_status_and_search() {
    let ctx = context().await;
    let alpha = call(
        &ctx,
        "documents_create",
        json!({"project_id": "log", "kind": "adr", "title": "Alpha", "body": "alpha body", "source_file": "docs/alpha.md"}),
    )
    .await;
    let alpha_id = alpha["id"].as_str().unwrap();
    let beta = call(
        &ctx,
        "documents_create",
        json!({"project_id": "log", "kind": "spec", "title": "Beta", "body": "beta body", "source_file": "docs/beta.md"}),
    )
    .await;
    let beta_id = beta["id"].as_str().unwrap();
    let gamma = call(
        &ctx,
        "documents_create",
        json!({"project_id": "spa", "kind": "guide", "title": "Gamma", "body": "gamma"}),
    )
    .await;
    let gamma_id = gamma["id"].as_str().unwrap();
    call(
        &ctx,
        "documents_update",
        json!({"document_id": gamma_id, "status": "accepted"}),
    )
    .await;

    let filtered = call(
        &ctx,
        "documents_list",
        json!({"kind": ["adr", "guide"], "sort": "title", "order": "asc", "fields": ["id", "title"]}),
    )
    .await;
    assert_eq!(filtered["total"], 2);
    let items = filtered["items"].as_array().unwrap();
    assert_eq!(items[0]["title"], "Alpha");
    assert_eq!(items[1]["title"], "Gamma");
    assert!(items[0].get("body").is_none());

    let found = call(&ctx, "documents_list", json!({"q": "DOCS/BETA"})).await;
    assert_eq!(found["total"], 1);
    assert_eq!(found["items"][0]["id"], beta_id);
    let no_body_search = call(&ctx, "documents_list", json!({"q": "body"})).await;
    assert_eq!(no_body_search["total"], 0);
    let source = call(&ctx, "documents_list", json!({"source_file": "ALPHA"})).await;
    assert_eq!(source["items"][0]["id"], alpha_id);
    let accepted = call(&ctx, "documents_list", json!({"status": "accepted"})).await;
    assert_eq!(accepted["total"], 1);
    assert_eq!(accepted["items"][0]["id"], gamma_id);
    let projects = call(
        &ctx,
        "documents_list",
        json!({"project_id": ["log", "spa"]}),
    )
    .await;
    assert_eq!(projects["total"], 3);

    let plan = call(&ctx, "plans_create", json!({"name": "Docs"})).await;
    let plan_id = plan["id"].as_str().unwrap();
    call(
        &ctx,
        "plans_documents_link",
        json!({"plan_id": plan_id, "document_id": beta_id}),
    )
    .await;
    call(
        &ctx,
        "plans_documents_link",
        json!({"plan_id": plan_id, "document_id": gamma_id}),
    )
    .await;
    let scoped = call(
        &ctx,
        "plans_documents_list",
        json!({"plan_id": plan_id, "kind": "guide", "include_body": true}),
    )
    .await;
    assert_eq!(scoped["total"], 1);
    assert_eq!(scoped["items"][0]["id"], gamma_id);
    assert_eq!(scoped["items"][0]["body"], "gamma");

    call(&ctx, "documents_delete", json!({"document_id": beta_id})).await;
    let deleted = call(&ctx, "documents_list", json!({"deleted_only": true})).await;
    assert_eq!(deleted["total"], 1);
    assert_eq!(deleted["items"][0]["id"], beta_id);
    let _ = alpha_id;
}
