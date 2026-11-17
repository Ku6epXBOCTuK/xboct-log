use serde_json::{Value, json};
use xboct_log_core::{
    ActivityEntry, ActivitySearch, ActivitySource, Db, create_task, list_activity, move_task,
    record_activity, search_activity, task_stats,
};

mod common;

use common::jsonv;

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

async fn insert(db: &Db, created_at: &str, source: &str, op: &str, entity: &str, id: &str) {
    sqlx::query(
        "INSERT INTO activity (created_at, source, client, op, entity, entity_id, fields, changes) VALUES (?, ?, NULL, ?, ?, ?, '[\"status\"]', '[]')",
    )
    .bind(created_at)
    .bind(source)
    .bind(op)
    .bind(entity)
    .bind(id)
    .execute(db.pool())
    .await
    .expect("activity");
}

async fn insert_for(db: &Db, created_at: &str, op: &str, entity_id: &str, entity_task_id: &str) {
    sqlx::query(
        "INSERT INTO activity (created_at, source, client, op, entity, entity_id, entity_task_id, fields, changes) VALUES (?, 'ui', NULL, ?, 'task', ?, ?, '[\"status\"]', '[]')",
    )
    .bind(created_at)
    .bind(op)
    .bind(entity_id)
    .bind(entity_task_id)
    .execute(db.pool())
    .await
    .expect("activity");
}

fn search(value: Value) -> ActivitySearch {
    serde_json::from_value(value).expect("search")
}

#[test]
fn rejects_an_unknown_operation_filter() {
    let error =
        serde_json::from_value::<ActivitySearch>(json!({"op": "tasks_missing"})).expect_err("op");
    assert!(error.to_string().contains("unknown variant"), "{error}");
}

#[tokio::test]
async fn lists_the_newest_activity_first_and_paginates() {
    let db = database().await;
    for (index, day) in ["01", "02", "03"].iter().enumerate() {
        insert(
            &db,
            &format!("2026-01-{day}T00:00:00.000Z"),
            "ui",
            &format!("tasks_update_{index}"),
            "task",
            "LOG-1",
        )
        .await;
    }

    let all = jsonv(
        list_activity(&db, "task", "LOG-1", None, None)
            .await
            .expect("list"),
    );
    assert_eq!(all["total"], 3);
    assert_eq!(all["items"][0]["op"], "tasks_update_2");
    assert_eq!(all["items"][2]["op"], "tasks_update_0");

    let page = jsonv(
        list_activity(&db, "task", "LOG-1", Some(1), Some(1))
            .await
            .expect("page"),
    );
    assert_eq!(page["total"], 3);
    assert_eq!(page["items"].as_array().map(Vec::len), Some(1));
    assert_eq!(page["items"][0]["op"], "tasks_update_1");
    assert_eq!(page["items"][0]["ts"], "2026-01-02T00:00:00.000Z");
}

#[tokio::test]
async fn follows_a_task_after_it_moves() {
    let db = database().await;
    let _task = jsonv(
        create_task(
            &db,
            serde_json::from_value(json!({"project_id": "log", "title": "Move me"})).expect("task"),
        )
        .await
        .expect("create"),
    );
    let uuid: String = sqlx::query_scalar("SELECT id FROM tasks WHERE key = 'LOG-1'")
        .fetch_one(db.pool())
        .await
        .expect("task id");
    insert_for(
        &db,
        "2026-01-01T00:00:00.000Z",
        "tasks_create",
        "LOG-1",
        &uuid,
    )
    .await;
    move_task(&db, "LOG-1", "spa").await.expect("move");
    insert_for(
        &db,
        "2026-01-02T00:00:00.000Z",
        "tasks_update",
        "SPA-1",
        &uuid,
    )
    .await;

    let history = jsonv(
        list_activity(&db, "task", "SPA-1", None, None)
            .await
            .expect("history"),
    );
    assert_eq!(history["total"], 2, "{history}");

    let stale = jsonv(
        list_activity(&db, "task", "LOG-1", None, None)
            .await
            .expect("stale"),
    );
    assert_eq!(stale["total"], 1, "the old key only finds its own row");

    let other = jsonv(
        list_activity(&db, "task", "LOG-99", None, None)
            .await
            .expect("other"),
    );
    assert_eq!(other["total"], 0);
}

#[tokio::test]
async fn searches_activity_by_source_op_entity_and_project() {
    let db = database().await;
    create_task(
        &db,
        serde_json::from_value(json!({"project_id": "log", "title": "Search me"})).expect("task"),
    )
    .await
    .expect("create");
    insert(
        &db,
        "2026-02-01T10:00:00.000Z",
        "ui",
        "tasks_update",
        "task",
        "LOG-1",
    )
    .await;
    insert(
        &db,
        "2026-02-02T10:00:00.000Z",
        "mcp",
        "tasks_create",
        "task",
        "LOG-1",
    )
    .await;
    insert(
        &db,
        "2026-02-03T10:00:00.000Z",
        "ui",
        "projects_update",
        "project",
        "spa",
    )
    .await;
    insert(
        &db,
        "2026-02-04T10:00:00.000Z",
        "ui",
        "tasks_update_legacy",
        "task",
        "LOG-1",
    )
    .await;

    let by_source = jsonv(
        search_activity(&db, &search(json!({"source": "mcp"})))
            .await
            .expect("source"),
    );
    assert_eq!(by_source["total"], 1);
    assert_eq!(by_source["items"][0]["op"], "tasks_create");

    let by_op = jsonv(
        search_activity(&db, &search(json!({"op": "projects_update"})))
            .await
            .expect("op"),
    );
    assert_eq!(by_op["total"], 1);
    assert_eq!(by_op["items"][0]["entity"], "project");

    let by_entity = jsonv(
        search_activity(&db, &search(json!({"entity": "task"})))
            .await
            .expect("entity"),
    );
    assert_eq!(by_entity["total"], 3);

    let by_project = jsonv(
        search_activity(&db, &search(json!({"project_id": "log"})))
            .await
            .expect("project"),
    );
    assert_eq!(by_project["total"], 3);

    let by_window = jsonv(
        search_activity(
            &db,
            &search(json!({"from": "2026-02-02T00:00:00.000Z", "to": "2026-02-02T23:59:59.999Z"})),
        )
        .await
        .expect("window"),
    );
    assert_eq!(by_window["total"], 1);

    let page = jsonv(
        search_activity(&db, &search(json!({"limit": 1, "offset": 1})))
            .await
            .expect("page"),
    );
    assert_eq!(page["total"], 4);
    assert_eq!(page["items"].as_array().map(Vec::len), Some(1));
    assert_eq!(
        page["ops"],
        json!(["projects_update", "tasks_create", "tasks_update"])
    );

    let unfiltered = jsonv(search_activity(&db, &search(json!({}))).await.expect("all"));
    assert_eq!(unfiltered["items"][0]["op"], "tasks_update_legacy");
}

#[tokio::test]
async fn lists_the_status_of_every_epic_child() {
    let db = database().await;
    let epic = jsonv(
        create_task(
            &db,
            serde_json::from_value(json!({"project_id": "log", "title": "Epic", "is_epic": true}))
                .expect("epic"),
        )
        .await
        .expect("create epic"),
    );
    let epic_id = epic["id"].as_str().expect("id").to_string();
    let child = jsonv(
        create_task(
            &db,
            serde_json::from_value(
                json!({"project_id": "log", "title": "Child", "epic_id": epic_id}),
            )
            .expect("child"),
        )
        .await
        .expect("create child"),
    );
    assert_eq!(child["epic_id"], epic_id);
    create_task(
        &db,
        serde_json::from_value(json!({
            "project_id": "log",
            "title": "Lonely",
            "is_epic": true
        }))
        .expect("lonely"),
    )
    .await
    .expect("create lonely");

    let stats = jsonv(task_stats(&db).await.expect("stats"));
    let epics = stats["epics"].as_array().expect("epics");
    let counted = epics
        .iter()
        .find(|epic| epic["id"] == epic_id)
        .expect("the epic with a child");
    let counts = &counted["children_counts"];
    for status in ["open", "in-progress", "blocked", "done", "cancelled"] {
        assert_eq!(counts[status], 0, "{status} is always listed");
    }
    assert_eq!(counts["backlog"], 1);
    assert_eq!(counts["total"], 1);

    let lonely = epics
        .iter()
        .find(|epic| epic["id"] != epic_id && epic["title"] == "Lonely")
        .expect("the lonely epic");
    assert!(
        lonely.get("children_counts").is_none(),
        "an epic without children has no counts at all"
    );
}

#[tokio::test]
async fn records_activity_and_reports_its_total() {
    let db = database().await;
    let task = jsonv(
        create_task(
            &db,
            serde_json::from_value(json!({"project_id": "log", "title": "Record me"}))
                .expect("task"),
        )
        .await
        .expect("create"),
    );
    let id = task["id"].as_str().expect("id").to_string();

    record_activity(
        &db,
        ActivitySource::Ui,
        "tasks_create",
        &[ActivityEntry::task(
            id.clone(),
            vec!["status".to_string()],
            Vec::new(),
        )],
        None,
        chrono::Local::now(),
    )
    .await
    .expect("record");

    let history = jsonv(
        list_activity(&db, "task", "LOG-1", None, None)
            .await
            .expect("history"),
    );
    assert_eq!(history["total"], 1);
    assert_eq!(history["items"][0]["fields"], json!(["status"]));
}
