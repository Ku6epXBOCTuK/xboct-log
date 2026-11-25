use serde_json::{Value, json};
use xboct_log_core::{
    AppErrorKind, Db, LinkFilter, NewTask, TaskFilters, TaskListEntry, TaskPatch, add_plan_item,
    count_epic_children_by_status, create_task, delete_task, get_task, list_tasks, move_task,
    resolve_task_id, update_task_detailed,
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
    let db = Db::open(":memory:").await.unwrap();
    db.migrate().await.unwrap();
    let pool = db.pool();
    for (id, name, prefix, archived) in [
        ("log", "Log", "LOG", None),
        ("spa", "Spa", "SPA", Some("2026-01-05T00:00:00.000Z")),
    ] {
        sqlx::query(
			"INSERT INTO projects (id, name, prefix, created_at, archived_at) VALUES (?, ?, ?, ?, ?)",
		)
		.bind(id)
		.bind(name)
		.bind(prefix)
		.bind("2026-01-01T00:00:00.000Z")
		.bind(archived)
		.execute(pool)
		.await
		.unwrap();
    }
    sqlx::query("INSERT INTO scopes (id, project_id, name, created_at) VALUES (1, 'log', 'backend', ?), (2, 'log', 'web', ?)")
		.bind("2026-01-01T00:00:00.000Z")
		.bind("2026-01-01T00:00:00.000Z")
		.execute(pool)
		.await
		.unwrap();
    for tag in ["bug", "docs"] {
        sqlx::query("INSERT INTO tags (name, created_at) VALUES (?, ?)")
            .bind(tag)
            .bind("2026-01-01T00:00:00.000Z")
            .execute(pool)
            .await
            .unwrap();
    }
    let tasks = [
        (
            "t1",
            "LOG-1",
            "log",
            1,
            "Rust port",
            "The rust rewrite epic",
            "open",
            "high",
            1,
            None,
            None,
            None,
            None,
            None,
            "2026-01-01T00:00:00.001Z",
            None,
            None,
            None,
        ),
        (
            "t2",
            "LOG-2",
            "log",
            2,
            "Port the tasks list",
            "## Heading\nSecond line with details",
            "backlog",
            "medium",
            0,
            Some("t1"),
            Some(1),
            Some("docs/rust-rewrite.md"),
            Some("Ivan"),
            Some("M"),
            "2026-01-01T00:00:00.002Z",
            Some("2026-12-01"),
            None,
            None,
        ),
        (
            "t3",
            "LOG-3",
            "log",
            3,
            "Write docs",
            "",
            "done",
            "low",
            0,
            Some("t1"),
            Some(2),
            None,
            None,
            None,
            "2026-01-01T00:00:00.003Z",
            None,
            Some("2026-01-01T00:00:00.003Z"),
            None,
        ),
        (
            "t4",
            "LOG-4",
            "log",
            4,
            "Third task",
            "Detailed body",
            "in-progress",
            "critical",
            0,
            None,
            None,
            None,
            None,
            Some("S"),
            "2026-01-01T00:00:00.004Z",
            None,
            None,
            None,
        ),
        (
            "t5",
            "LOG-5",
            "log",
            5,
            "Fifth task",
            "",
            "backlog",
            "low",
            0,
            None,
            None,
            None,
            None,
            None,
            "2026-01-01T00:00:00.002Z",
            None,
            None,
            None,
        ),
        (
            "t6",
            "SPA-2",
            "spa",
            2,
            "Second project",
            "",
            "open",
            "critical",
            0,
            None,
            None,
            None,
            None,
            None,
            "2026-01-01T00:00:00.005Z",
            None,
            None,
            None,
        ),
        (
            "t7",
            "SPA-1",
            "spa",
            1,
            "Deleted thing",
            "",
            "backlog",
            "low",
            0,
            None,
            None,
            None,
            None,
            None,
            "2026-01-01T00:00:00.000Z",
            None,
            None,
            Some("2026-01-02T00:00:00.000Z"),
        ),
    ];
    for (
        id,
        key,
        project,
        number,
        title,
        description,
        status,
        priority,
        is_epic,
        epic,
        scope,
        source,
        assignee,
        estimate,
        updated,
        due,
        closed,
        deleted,
    ) in tasks
    {
        sqlx::query(
			"INSERT INTO tasks (id, key, project_id, number, title, description, status, priority, is_epic, epic_id, scope_id, source_file, assignee, estimate, due_at, created_at, updated_at, closed_at, closed_reason, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		)
		.bind(id)
		.bind(key)
		.bind(project)
		.bind(number)
		.bind(title)
		.bind(description)
		.bind(status)
		.bind(priority)
		.bind(is_epic)
		.bind(epic)
		.bind(scope)
		.bind(source)
		.bind(assignee)
		.bind(estimate)
		.bind(due)
		.bind("2026-01-01T00:00:00.000Z")
		.bind(updated)
		.bind(closed)
		.bind(closed.map(|_| "fixed"))
		.bind(deleted)
		.execute(pool)
		.await
		.unwrap();
    }
    for (task, tag) in [("t2", "bug"), ("t2", "docs"), ("t3", "docs"), ("t4", "bug")] {
        sqlx::query("INSERT INTO task_tags (task_id, tag) VALUES (?, ?)")
            .bind(task)
            .bind(tag)
            .execute(pool)
            .await
            .unwrap();
    }
    for (source, target, link) in [
        ("t4", "t2", "blocks"),
        ("t1", "t3", "relates_to"),
        ("t4", "t1", "duplicates"),
    ] {
        sqlx::query(
			"INSERT INTO task_links (source_task_id, target_task_id, link_type, created_at) VALUES (?, ?, ?, ?)",
		)
		.bind(source)
		.bind(target)
		.bind(link)
		.bind("2026-01-01T00:00:00.000Z")
		.execute(pool)
		.await
		.unwrap();
    }
    db
}

fn filters(value: Value) -> TaskFilters {
    serde_json::from_value(value).unwrap()
}

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

async fn create_plain_task(db: &Db, title: &str) -> String {
    let input: NewTask = serde_json::from_value(json!({
        "project_id": "log",
        "title": title,
    }))
    .unwrap();
    create_task(db, input)
        .await
        .unwrap()
        .task
        .id
        .as_str()
        .to_string()
}

#[tokio::test]
async fn moved_task_id_points_at_the_new_id() {
    let db = database().await;
    let old = create_plain_task(&db, "Movable").await;

    let moved = move_task(&db, &old, "spa").await.unwrap();
    let expected = format!(
        "task {old} not found - moved to {} in project spa",
        moved.id.as_str()
    );
    assert_ne!(moved.id.as_str(), old);

    let error = get_task(&db, &old).await.unwrap_err();
    assert_eq!(error.kind(), AppErrorKind::NotFound);
    assert_eq!(error.message(), expected);
    assert_eq!(
        resolve_task_id(&db, &old).await.unwrap_err().message(),
        expected
    );
}

#[tokio::test]
async fn move_history_follows_a_chain_of_moves() {
    let db = database().await;
    let old = create_plain_task(&db, "Travelling").await;

    let moved = move_task(&db, &old, "spa").await.unwrap();
    let final_task = move_task(&db, moved.id.as_str(), "log").await.unwrap();

    let error = resolve_task_id(&db, &old).await.unwrap_err();
    assert_eq!(
        error.message(),
        format!(
            "task {old} not found - moved to {} in project log",
            final_task.id.as_str()
        )
    );
}

#[tokio::test]
async fn moved_child_id_points_at_its_new_id() {
    let db = database().await;
    let epic_input: NewTask = serde_json::from_value(json!({
        "project_id": "log",
        "title": "Epic",
        "is_epic": true,
    }))
    .unwrap();
    let epic = create_task(&db, epic_input).await.unwrap();
    let child_input: NewTask = serde_json::from_value(json!({
        "project_id": "log",
        "title": "Child",
        "epic_id": epic.task.id.as_str(),
    }))
    .unwrap();
    let child = create_task(&db, child_input).await.unwrap();
    let old_child = child.task.id.as_str().to_string();
    let child_id: (String,) = sqlx::query_as("SELECT id FROM tasks WHERE key = ?")
        .bind(&old_child)
        .fetch_one(db.pool())
        .await
        .unwrap();

    move_task(&db, epic.task.id.as_str(), "spa").await.unwrap();
    let new_child: (String,) = sqlx::query_as("SELECT key FROM tasks WHERE id = ?")
        .bind(&child_id.0)
        .fetch_one(db.pool())
        .await
        .unwrap();

    let error = resolve_task_id(&db, &old_child).await.unwrap_err();
    assert_eq!(
        error.message(),
        format!(
            "task {old_child} not found - moved to {} in project spa",
            new_child.0
        )
    );
}

#[tokio::test]
async fn deleted_moved_task_mentions_its_new_id() {
    let db = database().await;
    let old = create_plain_task(&db, "Deleted").await;
    let moved = move_task(&db, &old, "spa").await.unwrap();

    delete_task(&db, moved.id.as_str()).await.unwrap();

    let error = resolve_task_id(&db, &old).await.unwrap_err();
    assert_eq!(
        error.message(),
        format!(
            "task {old} not found - moved to {} in project spa (task is deleted)",
            moved.id.as_str()
        )
    );
}

async fn seed_plans(db: &Db) {
    for (id, name, deleted) in [
        ("p1", "Alpha", None),
        ("p2", "Beta", None),
        ("p3", "Gamma", Some("2026-01-02T00:00:00.000Z")),
    ] {
        sqlx::query(
            "INSERT INTO plans (id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id)
        .bind(name)
        .bind("2026-01-01T00:00:00.000Z")
        .bind("2026-01-01T00:00:00.000Z")
        .bind(deleted)
        .execute(db.pool())
        .await
        .unwrap();
    }
    for (plan, task, position) in [
        ("p1", "t1", 2048),
        ("p1", "t6", 1024),
        ("p1", "t3", 512),
        ("p2", "t1", 1024),
        ("p3", "t1", 512),
    ] {
        sqlx::query("INSERT INTO plan_items (plan_id, task_id, position) VALUES (?, ?, ?)")
            .bind(plan)
            .bind(task)
            .bind(position)
            .execute(db.pool())
            .await
            .unwrap();
    }
}

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
