use serde_json::{Value, json};
use xboct_log_core::{
    AppErrorKind, Db, NewTask, ProjectId, TaskPatch, create_scope, create_task, update_scope,
    update_task,
};

async fn database() -> Db {
    let db = Db::open(":memory:").await.expect("open");
    db.migrate().await.expect("migrate");
    sqlx::query("INSERT INTO projects (id, prefix, name, created_at) VALUES ('log', 'LOG', 'Log', '2026-01-01T00:00:00.000Z')")
        .execute(db.pool())
        .await
        .expect("project");
    db
}

fn task(value: Value) -> NewTask {
    serde_json::from_value(value).expect("task")
}

fn patch(value: Value) -> TaskPatch {
    serde_json::from_value(value).expect("patch")
}

#[tokio::test]
async fn creates_a_task_with_a_cyrillic_scope_name_in_any_case() {
    let db = database().await;
    let scope = create_scope(&db, &ProjectId::new("log"), "Деплой")
        .await
        .expect("scope");

    for name in ["деплой", "ДЕПЛОЙ", "Деплой"] {
        let created = create_task(
            &db,
            task(json!({"project_id": "log", "title": format!("task {name}"), "scope": name})),
        )
        .await
        .expect("create");
        assert_eq!(
            created.task.scope_id.map(|id| id.get()),
            Some(scope.id.get()),
            "{name}"
        );
    }
}

#[tokio::test]
async fn updates_a_task_with_a_cyrillic_scope_name_in_any_case() {
    let db = database().await;
    let scope = create_scope(&db, &ProjectId::new("log"), "Деплой")
        .await
        .expect("scope");
    let created = create_task(&db, task(json!({"project_id": "log", "title": "task"})))
        .await
        .expect("create");

    let updated = update_task(
        &db,
        created.task.id.as_str(),
        patch(json!({"scope": "ДЕПЛОЙ"})),
    )
    .await
    .expect("update");
    assert_eq!(
        updated.task.scope_id.map(|id| id.get()),
        Some(scope.id.get())
    );
}

#[tokio::test]
async fn rejects_scope_names_that_differ_only_by_case() {
    let db = database().await;
    let deploy = create_scope(&db, &ProjectId::new("log"), "Деплой")
        .await
        .expect("scope");
    create_scope(&db, &ProjectId::new("log"), "Релиз")
        .await
        .expect("scope");
    let other = create_scope(&db, &ProjectId::new("log"), "Ветка")
        .await
        .expect("scope");

    let create_error = create_scope(&db, &ProjectId::new("log"), "деплой")
        .await
        .expect_err("conflict");
    assert_eq!(create_error.kind(), AppErrorKind::Conflict);

    let update_error = update_scope(&db, other.id, Some("РЕЛИЗ"))
        .await
        .expect_err("conflict");
    assert_eq!(update_error.kind(), AppErrorKind::Conflict);

    let renamed = update_scope(&db, deploy.id, Some("ДЕПЛОЙ"))
        .await
        .expect("renaming in another case is allowed");
    assert_eq!(renamed.id, deploy.id);
}
