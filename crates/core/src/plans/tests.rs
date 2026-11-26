use super::*;
use crate::TaskUuid;

async fn open() -> Db {
    let db = Db::open(":memory:").await.expect("open");
    db.migrate().await.expect("migrate");
    sqlx::query("INSERT INTO projects (id, prefix, name, created_at) VALUES ('log', 'LOG', 'Log', '2026-01-01T00:00:00.000Z')")
        .execute(db.pool())
        .await
        .expect("project");
    db
}

#[test]
fn statuses_round_trip() {
    for status in PlanStatus::ALL {
        assert_eq!(PlanStatus::from_db(status.as_str()), Some(status));
    }
    assert_eq!(PlanStatus::from_db("open"), None);
}

#[tokio::test]
async fn creates_updates_and_soft_deletes_a_plan() {
    let db = open().await;
    let plan = create_plan(&db, "  Roadmap  ", "  notes  ", PlanStatus::Backlog)
        .await
        .expect("create");
    assert_eq!(plan.name, "Roadmap");
    assert_eq!(plan.description, "notes");
    assert_eq!(plan.status, PlanStatus::Backlog);
    assert!(plan.closed_at.is_none());
    assert_eq!(list_plans(&db).await.expect("list").len(), 1);

    let fresh = update_plan(
        &db,
        &plan.id,
        &PlanPatch {
            status: Some(PlanStatus::Done),
            ..PlanPatch::default()
        },
        Some(&plan.updated_at),
    )
    .await
    .expect("update");
    assert_eq!(fresh.status, PlanStatus::Done);
    assert!(fresh.closed_at.is_some());

    let stale = update_plan(&db, &plan.id, &PlanPatch::default(), Some(&plan.updated_at))
        .await
        .expect_err("stale update");
    assert_eq!(stale.kind(), crate::AppErrorKind::Conflict);

    delete_plan(&db, &plan.id).await.expect("delete");
    assert!(list_plans(&db).await.expect("list").is_empty());
    assert_eq!(list_deleted_plans(&db).await.expect("deleted").len(), 1);

    restore_plan(&db, &plan.id).await.expect("restore");
    assert_eq!(list_plans(&db).await.expect("list").len(), 1);
    assert!(list_deleted_plans(&db).await.expect("deleted").is_empty());
}

#[tokio::test]
async fn counts_tasks_and_epics_separately() {
    let db = open().await;
    let plan = create_plan(&db, "Release", "", PlanStatus::Active)
        .await
        .expect("create");
    for (index, (key, is_epic, status)) in [
        ("LOG-1", 0, "open"),
        ("LOG-2", 0, "done"),
        ("LOG-3", 1, "done"),
    ]
    .into_iter()
    .enumerate()
    {
        let uuid = TaskUuid::new();
        sqlx::query(
            "INSERT INTO tasks (id, project_id, number, is_epic, key, title, status, priority, created_at, updated_at)
             VALUES (?, 'log', ?, ?, ?, 't', ?, 'medium', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .bind(uuid.as_str())
        .bind(index as i64 + 1)
        .bind(is_epic)
        .bind(key)
        .bind(status)
        .execute(db.pool())
        .await
        .expect("task");
        sqlx::query("INSERT INTO plan_items (plan_id, task_id, position) VALUES (?, ?, ?)")
            .bind(&plan.id)
            .bind(uuid.as_str())
            .bind(1024)
            .execute(db.pool())
            .await
            .expect("item");
    }
    let counts = plan_counts(&db, &plan.id).await.expect("counts");
    assert_eq!(counts.tasks, 2);
    assert_eq!(counts.epics, 1);
    assert_eq!(counts.closed_tasks, 1);
    assert_eq!(
        count_plan_items(&db)
            .await
            .expect("all counts")
            .get(&plan.id),
        Some(&counts)
    );

    let empty = create_plan(&db, "Empty", "", PlanStatus::Backlog)
        .await
        .expect("empty plan");
    assert_eq!(
        plan_counts(&db, &empty.id).await.expect("empty counts"),
        PlanCounts::default()
    );
}

#[tokio::test]
async fn plan_keys_are_accepted_everywhere() {
    use crate::{
        DocumentKind, add_plan_item, create_document, documents_for_plan, link_document_to_plan,
        list_plan_items, remove_plan_item, unlink_document_from_plan,
    };

    let db = open().await;
    let plan = create_plan(&db, "Roadmap", "", PlanStatus::Active)
        .await
        .expect("create");
    assert_eq!((plan.key.as_str(), plan.number), ("PL-1", 1));
    assert_eq!(require_plan(&db, "PL-1").await.expect("key").id, plan.id);
    assert_eq!(
        require_plan(&db, " pl-1 ").await.expect("trimmed").id,
        plan.id
    );
    assert_eq!(require_plan(&db, &plan.id).await.expect("uuid").id, plan.id);
    assert_eq!(
        require_plan(&db, "1")
            .await
            .expect_err("bare number")
            .kind(),
        crate::AppErrorKind::Validation
    );
    assert_eq!(
        require_plan(&db, "LOG-1")
            .await
            .expect_err("other prefix")
            .kind(),
        crate::AppErrorKind::Validation
    );
    assert_eq!(
        require_plan(&db, "PL-99")
            .await
            .expect_err("unknown key")
            .kind(),
        crate::AppErrorKind::NotFound
    );

    let uuid = TaskUuid::new();
    sqlx::query(
        "INSERT INTO tasks (id, project_id, number, key, title, status, priority, created_at, updated_at)
         VALUES (?, 'log', 1, 'LOG-1', 'Task', 'backlog', 'medium', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    )
    .bind(uuid.as_str())
    .execute(db.pool())
    .await
    .expect("task");
    add_plan_item(&db, "PL-1", "LOG-1")
        .await
        .expect("add item by key");
    assert_eq!(list_plan_items(&db, "pl-1").await.expect("items").len(), 1);
    assert_eq!(plan_counts(&db, "PL-1").await.expect("counts").tasks, 1);
    remove_plan_item(&db, "PL-1", "LOG-1")
        .await
        .expect("remove item by key");
    assert!(
        list_plan_items(&db, &plan.id)
            .await
            .expect("items")
            .is_empty()
    );

    let document = create_document(&db, "log", DocumentKind::Adr, "ADR", "", None)
        .await
        .expect("document");
    link_document_to_plan(&db, "PL-1", "LOG-DOC-1")
        .await
        .expect("link by plan key");
    assert_eq!(
        documents_for_plan(&db, "pl-1").await.expect("linked").len(),
        1
    );
    unlink_document_from_plan(&db, "PL-1", "LOG-DOC-1")
        .await
        .expect("unlink by plan key");
    assert!(
        documents_for_plan(&db, &plan.id)
            .await
            .expect("linked")
            .is_empty()
    );
    let _ = document;

    let renamed = update_plan(
        &db,
        "PL-1",
        &PlanPatch {
            key: Some("pl-7".into()),
            ..PlanPatch::default()
        },
        None,
    )
    .await
    .expect("rename key");
    assert_eq!(renamed.key, "PL-7");
    assert_eq!(
        require_plan(&db, "PL-7").await.expect("new key").id,
        plan.id
    );
    assert_eq!(
        require_plan(&db, "PL-1").await.expect_err("old key").kind(),
        crate::AppErrorKind::NotFound
    );

    let other = create_plan(&db, "Other", "", PlanStatus::Backlog)
        .await
        .expect("other");
    assert_eq!(other.key, "PL-8");
    assert_eq!(
        update_plan(
            &db,
            &other.id,
            &PlanPatch {
                key: Some("PL-7".into()),
                ..PlanPatch::default()
            },
            None,
        )
        .await
        .expect_err("duplicate key")
        .kind(),
        crate::AppErrorKind::Conflict
    );

    delete_plan(&db, "PL-7").await.expect("delete by key");
    restore_plan(&db, "pl-7").await.expect("restore by key");
    delete_plan(&db, "PL-7").await.expect("delete again");
    let next = create_plan(&db, "Next", "", PlanStatus::Backlog)
        .await
        .expect("next");
    assert_eq!(next.key, "PL-9");
}
