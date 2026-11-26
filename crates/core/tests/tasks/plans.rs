use super::*;

#[tokio::test]
async fn task_reads_expose_plan_membership_only() {
    let db = database().await;
    seed_plans(&db).await;

    assert_eq!(get_task(&db, "LOG-1").await.unwrap().plan_ids, ["p1", "p2"]);
    assert_eq!(get_task(&db, "SPA-2").await.unwrap().plan_ids, ["p1"]);
    assert!(get_task(&db, "LOG-4").await.unwrap().plan_ids.is_empty());
    let value = serde_json::to_value(get_task(&db, "LOG-1").await.unwrap()).unwrap();
    assert_eq!(
        value["plan_names"],
        json!([{"id": "p1", "name": "Alpha"}, {"id": "p2", "name": "Beta"}])
    );

    assert_eq!(
        list_tasks(&db, &filters(json!({"plan_id": "p1"})))
            .await
            .unwrap()
            .total,
        2
    );
    assert_eq!(
        list_tasks(&db, &filters(json!({"plan_id": "p1", "unfinished": false})))
            .await
            .unwrap()
            .total,
        3
    );
    assert_eq!(
        list_tasks(&db, &filters(json!({"plan_id": "p3"})))
            .await
            .unwrap()
            .total,
        0
    );
    assert_eq!(
        list_tasks(&db, &filters(json!({"has_plan": true})))
            .await
            .unwrap()
            .total,
        3
    );
    assert_eq!(
        list_tasks(&db, &filters(json!({"has_plan": false})))
            .await
            .unwrap()
            .total,
        3
    );

    let ordered = list_tasks(
        &db,
        &filters(json!({"plan_id": "p1", "sort": "plan_position"})),
    )
    .await
    .unwrap();
    let ids: Vec<&str> = ordered
        .items
        .iter()
        .map(|item| match item {
            TaskListEntry::Full(task) => task.id.as_str(),
            TaskListEntry::Projected(view) => view.id.as_str(),
        })
        .collect();
    assert_eq!(ids, ["SPA-2", "LOG-1"]);

    let error = list_tasks(&db, &filters(json!({"sort": "plan_position"})))
        .await
        .unwrap_err();
    assert_eq!(error.kind(), AppErrorKind::Validation);

    let projected = list_tasks(
        &db,
        &filters(json!({"fields": "plan_ids", "plan_id": "p1"})),
    )
    .await
    .unwrap();
    let value = serde_json::to_value(&projected.items[0]).unwrap();
    assert_eq!(value["plan_ids"], json!(["p1"]));
    assert!(value.get("status").is_none());

    let named = list_tasks(
        &db,
        &filters(json!({"include_plan_names": true, "plan_id": "p1"})),
    )
    .await
    .unwrap();
    let values = serde_json::to_value(&named.items).unwrap();
    assert!(
        values
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["plan_names"]
                == json!([{"id": "p1", "name": "Alpha"}, {"id": "p2", "name": "Beta"}]))
    );
    assert!(values.as_array().unwrap().iter().all(|item| {
        item["plan_names"]
            .as_array()
            .unwrap()
            .iter()
            .all(|plan| plan["id"] != "p3")
    }));
}

#[tokio::test]
async fn task_write_results_carry_readable_plan_references() {
    let db = database().await;
    seed_plans(&db).await;

    let input: NewTask = serde_json::from_value(json!({
        "project_id": "log",
        "title": "Named",
    }))
    .unwrap();
    let created = create_task(&db, input).await.unwrap();
    let key = created.task.id.as_str().to_string();
    add_plan_item(&db, "p1", &key).await.unwrap();

    let patch: TaskPatch = serde_json::from_value(json!({"status": "open"})).unwrap();
    let updated = update_task_detailed(&db, &key, patch).await.unwrap();
    let value = serde_json::to_value(&updated.task).unwrap();
    assert_eq!(value["plan_ids"], json!(["p1"]));
    assert_eq!(value["plan_names"], json!([{"id": "p1", "name": "Alpha"}]));

    let moved = move_task(&db, &key, "spa").await.unwrap();
    let value = serde_json::to_value(&moved).unwrap();
    assert_eq!(value["plan_ids"], json!(["p1"]));
    assert_eq!(value["plan_names"], json!([{"id": "p1", "name": "Alpha"}]));
}

#[test]
fn task_writes_reject_plan_fields() {
    assert!(
        serde_json::from_value::<NewTask>(json!({
            "project_id": "log",
            "title": "Title",
            "plan_id": "p1",
        }))
        .is_err()
    );
    assert!(serde_json::from_value::<TaskPatch>(json!({"plan_id": "p1"})).is_err());
}

#[tokio::test]
async fn description_chars_previews_the_whole_description() {
    let db = database().await;
    let page = list_tasks(&db, &filters(json!({"description_chars": 14})))
        .await
        .unwrap();
    let task = page
        .items
        .iter()
        .find(|item| item.as_json()["id"] == "LOG-2")
        .unwrap();
    assert_eq!(task.as_json()["short_description"], "Heading Second…");
    assert!(task.as_json().get("description").is_none());
}

#[tokio::test]
async fn description_chars_caps_the_description_field() {
    let db = database().await;
    let page = list_tasks(
        &db,
        &filters(json!({
            "description_chars": 14,
            "fields": ["id", "description"],
        })),
    )
    .await
    .unwrap();
    let task = page
        .items
        .iter()
        .find(|item| item.as_json()["id"] == "LOG-2")
        .unwrap();
    assert_eq!(task.as_json()["description"], "Heading Second…");
    assert!(task.as_json().get("short_description").is_none());
}

#[tokio::test]
async fn rejects_invalid_description_chars() {
    let db = database().await;
    for value in [0, 2001] {
        let error = list_tasks(&db, &filters(json!({"description_chars": value})))
            .await
            .unwrap_err();
        assert_eq!(error.kind(), AppErrorKind::Validation);
    }
}

#[tokio::test]
async fn pages_large_lists_with_next_offset() {
    let db = database().await;
    for number in 1..=3 {
        let input: NewTask = serde_json::from_value(json!({
            "project_id": "log",
            "title": format!("Big {number}"),
            "description": "x".repeat(15_000),
        }))
        .unwrap();
        create_task(&db, input).await.unwrap();
    }
    let mut ids = Vec::new();
    let mut offset = None;
    loop {
        let mut query = json!({"include_description": true, "limit": 100});
        if let Some(value) = offset {
            query["offset"] = json!(value);
        }
        let page = list_tasks(&db, &filters(query)).await.unwrap();
        for item in &page.items {
            ids.push(item.as_json()["id"].as_str().unwrap().to_string());
        }
        let Some(next) = page.next_offset else {
            break;
        };
        assert!(next > offset.unwrap_or(0));
        offset = Some(next);
    }
    let mut unique = ids.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(ids.len(), 9);
    assert_eq!(unique.len(), ids.len());
}

#[tokio::test]
async fn created_tasks_get_v7_uuids() {
    let db = database().await;
    let input: NewTask = serde_json::from_value(json!({
        "project_id": "log",
        "title": "Timestamped id",
    }))
    .unwrap();
    let created = create_task(&db, input).await.unwrap();
    let id: String = sqlx::query_scalar("SELECT id FROM tasks WHERE key = ?")
        .bind(created.task.id.as_str())
        .fetch_one(db.pool())
        .await
        .unwrap();
    let uuid = uuid::Uuid::parse_str(&id).unwrap();
    assert_eq!(uuid.get_version_num(), 7, "{id}");
}
