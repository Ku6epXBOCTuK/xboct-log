use super::*;
use serde_json::json;

fn task() -> Task {
    Task {
        id: TaskKey::new("LOG-1"),
        project_id: ProjectId::new("log"),
        number: Seq::new(1),
        title: "Title".to_owned(),
        description: Some("Body".to_owned()),
        status: Status::Open,
        priority: Priority::Medium,
        is_epic: false,
        epic_id: None,
        scope_id: None,
        source_file: None,
        tags: Vec::new(),
        estimate: None,
        assignee: None,
        due_at: None,
        attachments_count: 2,
        created_at: "2026-01-01T00:00:00Z".to_owned(),
        updated_at: "2026-01-01T00:00:00Z".to_owned(),
        closed_at: None,
        closed_reason: None,
        blocked_reason: None,
        deleted_at: None,
        project_name: None,
        scope_name: None,
        short_description: Some("Body".to_owned()),
        blocked_by: Vec::new(),
        blocks: Vec::new(),
        relates_to: Vec::new(),
        duplicates: Vec::new(),
        duplicated_by: Vec::new(),
        children_counts: None,
        plan_ids: Vec::new(),
        plan_names: None,
    }
}

#[test]
fn description_preview_collapses_blank_lines() {
    let preview = description_preview("## Цель\n\nСнять   налог\n\nна тесты", 40);
    assert_eq!(preview, "Цель Снять налог на тесты");
}

#[test]
fn csv_and_array_selections_normalize_to_the_same_fields() {
    let csv = parse_fields(Some(&FieldSelection::Csv(
        "title, status, title".to_owned(),
    )));
    let list = parse_fields(Some(&FieldSelection::List(vec![
        "title".to_owned(),
        "status".to_owned(),
    ])));
    assert_eq!(csv, list);
    assert_eq!(csv, Some(vec!["title".to_owned(), "status".to_owned()]));
}

#[test]
fn projected_items_keep_identity_and_requested_data() {
    let value = serde_json::to_value(pick_fields(task(), Some(&["title".to_owned()]))).unwrap();
    assert_eq!(value["id"], json!("LOG-1"));
    assert_eq!(value["project_id"], json!("log"));
    assert_eq!(value["number"], json!(1));
    assert_eq!(value["title"], json!("Title"));
    assert!(value.get("status").is_none());
    assert!(value.get("description").is_none());
}

#[test]
fn unrecognized_fields_return_the_whole_task() {
    let full = serde_json::to_value(pick_fields(task(), None)).unwrap();
    let unknown = serde_json::to_value(pick_fields(task(), Some(&["bogus".to_owned()]))).unwrap();
    assert_eq!(full, unknown);
    assert_eq!(full["status"], json!("open"));
    assert_eq!(full["description"], json!("Body"));
}

#[tokio::test]
async fn task_search_treats_like_metacharacters_literally() {
    let db = Db::open(":memory:").await.expect("open");
    db.migrate().await.expect("migrate");
    sqlx::query(
        "INSERT INTO projects (id, prefix, name, created_at) VALUES ('log', 'LOG', 'Log', '2026-01-01T00:00:00.000Z')",
    )
    .execute(db.pool())
    .await
    .expect("project");
    sqlx::query(
        "INSERT INTO tags (name, created_at) VALUES ('under_score', '2026-01-01T00:00:00.000Z')",
    )
    .execute(db.pool())
    .await
    .expect("tag");
    fn filters(value: serde_json::Value) -> TaskFilters {
        serde_json::from_value(value).expect("filters")
    }

    for (number, title, source_file, tagged) in [
        (1, "100% done", Some("docs/100%.md"), false),
        (2, "a_b done", Some("docs/a_b.md"), true),
        (3, "100x done", None, false),
    ] {
        let key = format!("LOG-{number}");
        sqlx::query(
            "INSERT INTO tasks (id, project_id, number, title, description, status, priority, is_epic, source_file, created_at, updated_at, key)
             VALUES (?, 'log', ?, ?, 'body', 'open', 'medium', 0, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', ?)",
        )
        .bind(&key)
        .bind(number)
        .bind(title)
        .bind(source_file)
        .bind(&key)
        .execute(db.pool())
        .await
        .expect("task");
        if tagged {
            sqlx::query("INSERT INTO task_tags (task_id, tag) VALUES (?, 'under_score')")
                .bind(&key)
                .execute(db.pool())
                .await
                .expect("task tag");
        }
    }

    for (term, expected) in [
        ("100%", "LOG-1"),
        ("a_b", "LOG-2"),
        ("under_score", "LOG-2"),
    ] {
        let found = list_tasks(&db, &filters(json!({ "q": term })))
            .await
            .expect("q search");
        assert_eq!(found.total, 1, "term {term}");
        assert_eq!(
            serde_json::to_value(&found.items[0]).unwrap()["id"],
            json!(expected)
        );
    }

    let titled = list_tasks(&db, &filters(json!({ "title": "100%" })))
        .await
        .expect("title search");
    assert_eq!(titled.total, 1);
    assert_eq!(
        serde_json::to_value(&titled.items[0]).unwrap()["id"],
        json!("LOG-1")
    );

    let sources = list_tasks(&db, &filters(json!({ "source_file": "a_b" })))
        .await
        .expect("source search");
    assert_eq!(sources.total, 1);
    assert_eq!(
        serde_json::to_value(&sources.items[0]).unwrap()["id"],
        json!("LOG-2")
    );

    let any = list_tasks(&db, &filters(json!({ "q_any": ["100%", "a_b"] })))
        .await
        .expect("q_any search");
    assert_eq!(any.total, 2);

    let plain = list_tasks(&db, &filters(json!({ "q": "done" })))
        .await
        .expect("plain search");
    assert_eq!(plain.total, 3);
}
