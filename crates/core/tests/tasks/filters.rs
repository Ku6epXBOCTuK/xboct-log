use super::*;

#[tokio::test]
async fn lists_tasks_in_the_node_shape() {
    let db = database().await;
    let page = list_tasks(&db, &filters(json!({}))).await.unwrap();
    assert_eq!(page.total, 6);
    assert_eq!(page.items.len(), 6);
    assert_eq!(page.items[0].as_json()["id"], "SPA-2");
    let first = page
        .items
        .iter()
        .find(|item| item.as_json()["id"] == "LOG-2")
        .unwrap();
    assert_eq!(first.as_json()["id"], "LOG-2");
    assert_eq!(first.as_json()["project_id"], "log");
    assert_eq!(first.as_json()["number"], 2);
    assert_eq!(first.as_json()["status"], "backlog");
    assert_eq!(first.as_json()["priority"], "medium");
    assert_eq!(first.as_json()["is_epic"], false);
    assert_eq!(first.as_json()["epic_id"], "LOG-1");
    assert_eq!(first.as_json()["scope_id"], 1);
    assert_eq!(first.as_json()["estimate"], "M");
    assert_eq!(first.as_json()["assignee"], "Ivan");
    assert_eq!(first.as_json()["due_at"], "2026-12-01");
    assert_eq!(first.as_json()["attachments_count"], 0);
    assert_eq!(first.as_json()["tags"], json!(["bug", "docs"]));
    assert_eq!(first.as_json()["short_description"], "Heading");
    assert!(first.as_json().get("description").is_none());
    assert_eq!(first.as_json()["blocked_by"], json!(["LOG-4"]));
    assert_eq!(first.as_json()["blocks"], json!([]));
    assert_eq!(first.as_json()["relates_to"], json!([]));
    assert_eq!(first.as_json()["duplicates"], json!([]));
    assert_eq!(first.as_json()["duplicated_by"], json!([]));
    assert_eq!(first.as_json()["closed_at"], Value::Null);
    assert_eq!(first.as_json()["deleted_at"], Value::Null);
}

#[tokio::test]
async fn applies_filters_like_the_node_registry() {
    let db = database().await;
    let cases = [
        (json!({"project_id": "log"}), 5),
        (json!({"status": "open"}), 2),
        (json!({"tag": "BUG"}), 2),
        (json!({"assignee": "ivan"}), 1),
        (json!({"estimate": "S"}), 1),
        (json!({"epic_id": "LOG-1"}), 2),
        (json!({"epic_id": null}), 4),
        (json!({"scope_id": null}), 4),
        (json!({"scope_id": 1}), 1),
        (json!({"scope_id": [1, 2]}), 2),
        (json!({"scope_id": []}), 6),
        (json!({"has_tags": false}), 3),
        (json!({"q": "detailed"}), 1),
        (json!({"title_exact": "write docs"}), 1),
        (json!({"source_file": "rust-rewrite"}), 1),
        (
            json!({"project_archived": true, "include_project": true}),
            1,
        ),
        (json!({"deleted_only": true}), 1),
        (json!({"include_deleted": true}), 7),
        (json!({"blocked_by": "LOG-4"}), 1),
        (json!({"blocks": "LOG-2"}), 1),
    ];
    for (value, total) in cases {
        let page = list_tasks(&db, &filters(value.clone())).await.unwrap();
        assert_eq!(page.total, total, "{value}");
    }
}

#[tokio::test]
async fn hides_closed_plan_items_by_default_only_for_plans() {
    let db = database().await;
    seed_plans(&db).await;

    let all = list_tasks(&db, &filters(json!({}))).await.unwrap();
    assert_eq!(all.total, 6);

    let explicit = list_tasks(&db, &filters(json!({"unfinished": true})))
        .await
        .unwrap();
    assert_eq!(explicit.total, 5);

    let plan = list_tasks(&db, &filters(json!({"plan_id": "p1"})))
        .await
        .unwrap();
    assert_eq!(plan.total, 2);

    let plan_all = list_tasks(&db, &filters(json!({"plan_id": "p1", "unfinished": false})))
        .await
        .unwrap();
    assert_eq!(plan_all.total, 3);

    let plan_status = list_tasks(&db, &filters(json!({"plan_id": "p1", "status": "done"})))
        .await
        .unwrap();
    assert_eq!(plan_status.total, 1);

    let plan_both = list_tasks(
        &db,
        &filters(json!({"plan_id": "p1", "status": "done", "unfinished": true})),
    )
    .await
    .unwrap();
    assert_eq!(plan_both.total, 0);
}

#[test]
fn tells_a_missing_link_filter_from_an_explicit_null() {
    let absent = filters(json!({}));
    assert_eq!(absent.scope_id, LinkFilter::Any);
    assert_eq!(absent.epic_id, LinkFilter::Any);
    let explicit = filters(json!({"scope_id": null, "epic_id": null}));
    assert_eq!(explicit.scope_id, LinkFilter::Null);
    assert_eq!(explicit.epic_id, LinkFilter::Null);
    let values = filters(json!({"scope_id": [1, 2], "epic_id": "LOG-1"}));
    assert!(matches!(values.scope_id, LinkFilter::Values(ref values) if values.len() == 2));
    assert!(matches!(values.epic_id, LinkFilter::Values(ref values) if values.len() == 1));
}

#[tokio::test]
async fn searching_for_null_does_not_match_missing_epic_or_source() {
    let db = database().await;

    for filter in [json!({"q": "null"}), json!({"q_any": ["null"]})] {
        let page = list_tasks(&db, &filters(filter.clone())).await.unwrap();
        assert_eq!(page.total, 0, "{filter}");
        assert!(page.items.is_empty(), "{filter}");
    }
}

#[tokio::test]
async fn keeps_exact_matches_first_next_to_text_terms() {
    let db = database().await;
    let page = list_tasks(
        &db,
        &filters(json!({"sort": "title", "q_any": ["port"], "id_exact": ["LOG-4"]})),
    )
    .await
    .unwrap();
    assert_eq!(
        page.items
            .iter()
            .map(|item| match item {
                TaskListEntry::Full(task) => task.id.as_str(),
                TaskListEntry::Projected(view) => view.id.as_str(),
            })
            .collect::<Vec<_>>(),
        ["LOG-4", "LOG-2", "LOG-1"]
    );
    let paged = list_tasks(
        &db,
        &filters(json!({"sort": "title", "limit": 2, "offset": 1})),
    )
    .await
    .unwrap();
    assert_eq!(paged.total, 6);
    assert_eq!(paged.items.len(), 2);
    assert_eq!(paged.items[0].as_json()["id"], "LOG-2");
}

#[tokio::test]
async fn matches_only_the_requested_task_when_every_term_is_exact() {
    let db = database().await;
    for value in [
        json!({"id_exact": ["LOG-4"]}),
        json!({"id_exact": ["log-4"]}),
        json!({"number_exact": [4]}),
    ] {
        let page = list_tasks(&db, &filters(value.clone())).await.unwrap();
        assert_eq!(page.total, 1, "{value}");
        assert_eq!(page.items[0].as_json()["id"], "LOG-4", "{value}");
    }
    let missing = list_tasks(&db, &filters(json!({"number_exact": [99]})))
        .await
        .unwrap();
    assert_eq!(missing.total, 0);
}

#[tokio::test]
async fn attaches_project_and_scope_names_on_request() {
    let db = database().await;
    let page = list_tasks(
		&db,
		&filters(json!({"project_id": "log", "scope_id": 1, "include_project": true, "include_scope": true, "limit": 1})),
	)
	.await
	.unwrap();
    let first = &page.items[0];
    assert_eq!(first.as_json()["project_name"], "Log");
    assert_eq!(first.as_json()["scope_name"], "backend");
}

#[tokio::test]
async fn limits_the_payload_to_the_requested_fields() {
    let db = database().await;
    let page = list_tasks(
        &db,
        &filters(json!({"fields": "title,status,bogus", "limit": 1})),
    )
    .await
    .unwrap();
    let value = page.items[0].as_json();
    let first = value.as_object().unwrap();
    let mut names = first.keys().map(String::as_str).collect::<Vec<_>>();
    names.sort_unstable();
    assert_eq!(names, ["id", "number", "project_id", "status", "title"]);
}

#[tokio::test]
async fn counts_epic_children_by_status() {
    let db = database().await;
    let counts = count_epic_children_by_status(&db, "LOG-1").await.unwrap();
    assert_eq!(counts.get("backlog"), Some(&1));
    assert_eq!(counts.get("done"), Some(&1));
    assert_eq!(counts.get("open"), Some(&0));
    assert_eq!(counts.get("total"), Some(&2));
}

#[tokio::test]
async fn reads_one_task_and_hides_deleted_ones() {
    let db = database().await;
    let task = get_task(&db, "log-2").await.unwrap();
    assert_eq!(task.id, "LOG-2");
    assert_eq!(
        task.description.as_deref(),
        Some("## Heading\nSecond line with details")
    );
    assert_eq!(task.blocked_by, ["LOG-4"]);

    assert_eq!(
        get_task(&db, "SPA-1").await.unwrap_err().kind(),
        AppErrorKind::NotFound
    );
    let error = get_task(&db, "999").await.unwrap_err();
    assert_eq!(error.kind(), AppErrorKind::Validation);
    assert!(error.message().contains("task id must be 'PREFIX-NUMBER'"));
}

#[tokio::test]
async fn hints_at_unknown_task_ids() {
    let db = database().await;
    let error = resolve_task_id(&db, "LOG-6").await.unwrap_err();
    assert_eq!(error.kind(), AppErrorKind::NotFound);
    assert_eq!(
        error.message(),
        "task LOG-6 not found - did you mean LOG-5 or LOG-4 or LOG-3?"
    );
    let prefix = resolve_task_id(&db, "NOPE-1").await.unwrap_err();
    assert!(prefix.message().contains("unknown project prefix 'NOPE'"));
}
