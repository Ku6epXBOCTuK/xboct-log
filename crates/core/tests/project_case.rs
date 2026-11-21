use serde_json::{Value, json};
use xboct_log_core::{
    ActivitySearch, Db, DocumentKind, DocumentQuery, NewTask, ProjectId, TagQuery, TaskFilters,
    create_document, create_scope, create_task, ensure_tag, get_project, list_scopes, list_tags,
    list_tasks, query_documents, search_activity,
};

async fn database() -> Db {
    let db = Db::open(":memory:").await.expect("open");
    db.migrate().await.expect("migrate");
    for (id, prefix, name) in [("log", "LOG", "Log"), ("spa", "SPA", "Spa")] {
        sqlx::query(
            "INSERT INTO projects (id, prefix, name, created_at) VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z')",
        )
        .bind(id)
        .bind(prefix)
        .bind(name)
        .execute(db.pool())
        .await
        .expect("project");
    }
    db
}

fn task(value: Value) -> NewTask {
    serde_json::from_value(value).expect("task")
}

fn filters(value: Value) -> TaskFilters {
    serde_json::from_value(value).expect("filters")
}

fn search(value: Value) -> ActivitySearch {
    serde_json::from_value(value).expect("search")
}

fn documents(value: Value) -> DocumentQuery {
    serde_json::from_value(value).expect("documents")
}

async fn seed(db: &Db) -> String {
    ensure_tag(db, "rust").await.expect("tag");
    let created = create_task(
        db,
        task(json!({"project_id": "log", "title": "One", "tags": ["rust"]})),
    )
    .await
    .expect("log task");
    create_task(db, task(json!({"project_id": "spa", "title": "Two"})))
        .await
        .expect("spa task");
    created.task.id.as_str().to_string()
}

async fn insert_activity(db: &Db, entity: &str, entity_id: &str, entity_task_id: Option<&str>) {
    sqlx::query(
        "INSERT INTO activity (created_at, source, client, op, entity, entity_id, entity_task_id, fields, changes)
         VALUES ('2026-01-01T00:00:00.000Z', 'ui', NULL, 'tasks_update', ?, ?, ?, '[]', '[]')",
    )
    .bind(entity)
    .bind(entity_id)
    .bind(entity_task_id)
    .execute(db.pool())
    .await
    .expect("activity");
}

#[tokio::test]
async fn project_filters_ignore_case() {
    let db = database().await;
    seed(&db).await;

    let lower = list_tasks(&db, &filters(json!({"project_id": "log"})))
        .await
        .expect("list");
    let upper = list_tasks(&db, &filters(json!({"project_id": "LOG"})))
        .await
        .expect("list");
    assert_eq!(lower.total, 1);
    assert_eq!(upper.total, lower.total);

    let lower_excluded = list_tasks(&db, &filters(json!({"exclude_project_id": "spa"})))
        .await
        .expect("list");
    let upper_excluded = list_tasks(&db, &filters(json!({"exclude_project_id": "SPA"})))
        .await
        .expect("list");
    assert_eq!(lower_excluded.total, 1);
    assert_eq!(upper_excluded.total, lower_excluded.total);

    let project = get_project(&db, "LOG")
        .await
        .expect("get")
        .expect("project");
    assert_eq!(project.id.as_str(), "log");
}

#[tokio::test]
async fn project_scoped_reads_ignore_case() {
    let db = database().await;
    let key = seed(&db).await;
    let scope = create_scope(&db, &ProjectId::new("log"), "Area")
        .await
        .expect("scope");
    let document = create_document(&db, "log", DocumentKind::Adr, "Choice", "", None)
        .await
        .expect("document");

    let lower_tags = list_tags(
        &db,
        &TagQuery {
            project_ids: vec![ProjectId::new("log")],
            statuses: Vec::new(),
        },
    )
    .await
    .expect("tags");
    let upper_tags = list_tags(
        &db,
        &TagQuery {
            project_ids: vec![ProjectId::new("LOG")],
            statuses: Vec::new(),
        },
    )
    .await
    .expect("tags");
    assert_eq!(lower_tags.len(), 1);
    assert_eq!(upper_tags, lower_tags);

    let lower_scopes = list_scopes(&db, Some(&ProjectId::new("log")))
        .await
        .expect("scopes");
    let upper_scopes = list_scopes(&db, Some(&ProjectId::new("LOG")))
        .await
        .expect("scopes");
    assert_eq!(lower_scopes.len(), 1);
    assert_eq!(upper_scopes, lower_scopes);

    let task_id: String = sqlx::query_scalar("SELECT id FROM tasks WHERE key = ?")
        .bind(&key)
        .fetch_one(db.pool())
        .await
        .expect("task id");
    insert_activity(&db, "project", "log", None).await;
    insert_activity(&db, "task", &key, None).await;
    insert_activity(&db, "task", "other", Some(&task_id)).await;
    insert_activity(&db, "scope", &scope.id.get().to_string(), None).await;
    insert_activity(&db, "document", &document.id, None).await;
    let lower_activity = search_activity(&db, &search(json!({"project_id": "log"})))
        .await
        .expect("activity");
    let upper_activity = search_activity(&db, &search(json!({"project_id": "LOG"})))
        .await
        .expect("activity");
    assert_eq!(lower_activity.total, 5);
    assert_eq!(upper_activity.total, lower_activity.total);

    let lower_documents = query_documents(&db, None, &documents(json!({"project_id": "log"})))
        .await
        .expect("documents");
    let upper_documents = query_documents(&db, None, &documents(json!({"project_id": "LOG"})))
        .await
        .expect("documents");
    assert_eq!(lower_documents.total, 1);
    assert_eq!(upper_documents.total, lower_documents.total);
}

#[tokio::test]
async fn project_writes_store_canonical_id() {
    let db = database().await;

    let scope = create_scope(&db, &ProjectId::new("LOG"), "Area")
        .await
        .expect("scope");
    assert_eq!(scope.project_id.as_str(), "log");
    assert!(
        create_scope(&db, &ProjectId::new("LOG"), "Area")
            .await
            .is_err()
    );

    let document = create_document(&db, "LOG", DocumentKind::Adr, "Choice", "", None)
        .await
        .expect("document");
    assert_eq!(document.project_id, "log");
}
