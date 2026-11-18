use serde_json::{Value, json};
use xboct_log_core::{
    Db, NewTask, SearchTerm, TaskFilters, TaskListEntry, TaskPatch, create_task, delete_task,
    get_tasks_by_ids, list_revisions, list_tasks, parse_search_query, task_options, task_stats,
    update_task,
};

trait AsJson {
    fn as_json(&self) -> Value;
}

impl AsJson for TaskListEntry {
    fn as_json(&self) -> Value {
        serde_json::to_value(self).unwrap()
    }
}

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

fn new_task(value: Value) -> NewTask {
    serde_json::from_value(value).expect("task")
}

mod common;

use common::jsonv;

fn patch(value: Value) -> TaskPatch {
    serde_json::from_value(value).expect("patch")
}

fn filters(value: Value) -> TaskFilters {
    serde_json::from_value(value).expect("filters")
}

#[test]
fn parses_search_terms_like_node() {
    assert_eq!(
        parse_search_query("rust deploy"),
        vec![
            SearchTerm::Text("rust".into()),
            SearchTerm::Text("deploy".into())
        ]
    );
    assert_eq!(parse_search_query("=29"), vec![SearchTerm::Number(29)]);
    assert_eq!(parse_search_query("=029"), vec![SearchTerm::Number(29)]);
    assert_eq!(
        parse_search_query("=log-2"),
        vec![SearchTerm::Id("LOG-2".into())]
    );
    assert_eq!(
        parse_search_query("=Add"),
        vec![SearchTerm::Text("add".into())]
    );
    assert_eq!(
        parse_search_query("\"add button\""),
        vec![SearchTerm::Text("add button".into())]
    );
    assert_eq!(parse_search_query("= \"\"  "), Vec::new());
}

#[tokio::test]
async fn answers_options_and_stats() {
    let db = database().await;
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "Epic", "is_epic": true})),
    )
    .await
    .expect("epic");
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "One", "epic_id": "LOG-1"})),
    )
    .await
    .expect("one");
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "Two", "epic_id": "LOG-1"})),
    )
    .await
    .expect("two");
    create_task(
        &db,
        new_task(json!({"project_id": "spa", "title": "Other"})),
    )
    .await
    .expect("other");

    let options = task_options(&db, Some("log"), None, None)
        .await
        .expect("options");
    let ids: Vec<&str> = options
        .items
        .iter()
        .map(|item| match item {
            TaskListEntry::Full(task) => task.id.as_str(),
            TaskListEntry::Projected(view) => view.id.as_str(),
        })
        .collect();
    assert_eq!(ids, ["LOG-1", "LOG-2", "LOG-3"]);
    assert!(options.items[0].as_json().get("description").is_none());

    let searched = task_options(&db, None, Some("=SPA-1"), None)
        .await
        .expect("search");
    assert_eq!(searched.items.len(), 1);
    assert_eq!(searched.items[0].as_json()["id"], "SPA-1");

    let stats = jsonv(task_stats(&db).await.expect("stats"));
    assert_eq!(stats["tasks"].as_object().expect("tasks").len(), 6);
    let epics = stats["epics"].as_array().expect("epics");
    assert_eq!(epics.len(), 1);
    assert_eq!(epics[0]["id"], "LOG-1");
    assert_eq!(epics[0]["children_counts"]["total"], 2);
    assert_eq!(epics[0]["children_counts"]["backlog"], 2);
}

#[tokio::test]
async fn reads_revisions_many_and_deleted() {
    let db = database().await;
    create_task(
        &db,
        new_task(json!({"project_id": "log", "title": "One", "description": "old body"})),
    )
    .await
    .expect("create");
    update_task(&db, "LOG-1", patch(json!({"description": "new body"})))
        .await
        .expect("update");

    let revisions = jsonv(
        list_revisions(&db, "LOG-1", Some("description"), None)
            .await
            .expect("revisions"),
    );
    assert_eq!(revisions["total"], 1);
    assert_eq!(revisions["items"][0]["body"], "old body");
    assert_eq!(revisions["items"][0]["task_id"], "LOG-1");

    let many = get_tasks_by_ids(&db, &["LOG-1".into(), "NOPE-1".into(), "LOG-1".into()])
        .await
        .expect("many");
    assert_eq!(many.items.len(), 1);
    assert_eq!(many.missing, vec!["NOPE-1"]);

    create_task(&db, new_task(json!({"project_id": "log", "title": "Gone"})))
        .await
        .expect("create gone");
    delete_task(&db, "LOG-2").await.expect("delete");
    let deleted = list_tasks(&db, &filters(json!({"deleted_only": true})))
        .await
        .expect("list");
    assert_eq!(deleted.total, 1);
    assert_eq!(deleted.items[0].as_json()["id"], "LOG-2");
}
