use super::*;
use crate::{PlanStatus, create_plan, delete_plan, list_plans, restore_plan};

async fn open() -> Db {
    let db = Db::open(":memory:").await.expect("open");
    db.migrate().await.expect("migrate");
    for (id, prefix) in [("log", "LOG"), ("spa", "SPA")] {
        sqlx::query(
            "INSERT INTO projects (id, prefix, name, created_at) VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z')",
        )
        .bind(id)
        .bind(prefix)
        .bind(id)
        .execute(db.pool())
        .await
        .expect("project");
    }
    for (key, project, number, is_epic) in [
        ("LOG-1", "log", 1, 0),
        ("LOG-2", "log", 2, 1),
        ("SPA-1", "spa", 1, 0),
    ] {
        let uuid = TaskUuid::new();
        sqlx::query(
            "INSERT INTO tasks (id, project_id, number, is_epic, key, title, status, priority, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'task', 'backlog', 'medium', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .bind(uuid.as_str())
        .bind(project)
        .bind(number)
        .bind(is_epic)
        .bind(key)
        .execute(db.pool())
        .await
        .expect("task");
    }
    db
}

#[tokio::test]
async fn keeps_items_from_different_projects_in_one_order() {
    let db = open().await;
    let plan = create_plan(&db, "Roadmap", "", PlanStatus::Active)
        .await
        .expect("plan");
    add_plan_item(&db, &plan.id, "LOG-1")
        .await
        .expect("add log");
    add_plan_item(&db, &plan.id, "SPA-1")
        .await
        .expect("add spa");

    let items = list_plan_items(&db, &plan.id).await.expect("items");
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].key, "LOG-1");
    assert_eq!(items[0].project_id, "log");
    assert_eq!(items[1].key, "SPA-1");
    assert_eq!(items[1].project_id, "spa");

    let reordered = reorder_plan_items(&db, &plan.id, &["SPA-1".to_string(), "LOG-1".to_string()])
        .await
        .expect("reorder");
    assert_eq!(reordered[0].key, "SPA-1");
    assert_eq!(reordered[1].key, "LOG-1");
    assert_eq!(reordered[0].position, 1024);
    assert_eq!(reordered[1].position, 2048);

    let stale = reorder_plan_items(&db, &plan.id, &["LOG-1".to_string()])
        .await
        .expect_err("incomplete list");
    assert_eq!(stale.kind(), crate::AppErrorKind::Validation);
    assert_eq!(
        list_plan_items(&db, &plan.id).await.expect("items")[0].key,
        "SPA-1"
    );
}

#[tokio::test]
async fn reorder_is_idempotent_and_rejects_stale_keys_atomically() {
    let db = open().await;
    let plan = create_plan(&db, "Roadmap", "", PlanStatus::Active)
        .await
        .expect("plan");
    for key in ["LOG-1", "LOG-2", "SPA-1"] {
        add_plan_item(&db, &plan.id, key).await.expect("add item");
    }

    let order = [
        "LOG-2".to_string(),
        "SPA-1".to_string(),
        "LOG-1".to_string(),
    ];
    let first = reorder_plan_items(&db, &plan.id, &order)
        .await
        .expect("reorder");
    assert_eq!(
        first
            .iter()
            .map(|item| item.key.as_str())
            .collect::<Vec<_>>(),
        order
    );
    assert!(first[0].is_epic);
    assert_eq!(
        first.iter().map(|item| item.position).collect::<Vec<_>>(),
        vec![1024, 2048, 3072]
    );

    let again = reorder_plan_items(&db, &plan.id, &order)
        .await
        .expect("repeat");
    assert_eq!(again, first);

    for bad in [
        vec![
            "LOG-2".to_string(),
            "NOPE-1".to_string(),
            "LOG-1".to_string(),
        ],
        vec![
            "LOG-2".to_string(),
            "LOG-2".to_string(),
            "LOG-1".to_string(),
        ],
    ] {
        let error = reorder_plan_items(&db, &plan.id, &bad)
            .await
            .expect_err("bad list");
        assert_eq!(error.kind(), crate::AppErrorKind::Validation);
        assert_eq!(list_plan_items(&db, &plan.id).await.expect("items"), first);
    }

    crate::move_task(&db, "LOG-1", "spa").await.expect("move");
    let stale = reorder_plan_items(&db, &plan.id, &order)
        .await
        .expect_err("stale key");
    assert_eq!(stale.kind(), crate::AppErrorKind::Validation);
    let items = list_plan_items(&db, &plan.id).await.expect("items");
    assert_eq!(items[0].key, "LOG-2");
    assert_eq!(items[2].key, "SPA-2");
    assert_eq!(items[2].position, 3072);

    let fresh = reorder_plan_items(
        &db,
        &plan.id,
        &[
            "LOG-2".to_string(),
            "SPA-1".to_string(),
            "SPA-2".to_string(),
        ],
    )
    .await
    .expect("fresh keys");
    assert_eq!(fresh[2].key, "SPA-2");
    assert_eq!(fresh[2].position, 3072);
}

#[tokio::test]
async fn moving_an_epic_and_soft_deleting_its_child_keep_plan_composition() {
    let db = open().await;
    let epic_uuid: (String,) = sqlx::query_as("SELECT id FROM tasks WHERE key = 'LOG-2'")
        .fetch_one(db.pool())
        .await
        .expect("epic");
    sqlx::query("UPDATE tasks SET epic_id = ? WHERE key = 'LOG-1'")
        .bind(&epic_uuid.0)
        .execute(db.pool())
        .await
        .expect("child");

    let plan = create_plan(&db, "Roadmap", "", PlanStatus::Active)
        .await
        .expect("plan");
    add_plan_item(&db, &plan.id, "LOG-2")
        .await
        .expect("epic item");
    add_plan_item(&db, &plan.id, "LOG-1")
        .await
        .expect("child item");
    reorder_plan_items(&db, &plan.id, &["LOG-1".to_string(), "LOG-2".to_string()])
        .await
        .expect("reorder");
    let note = add_plan_note(&db, &plan.id, "LOG-1", "child note")
        .await
        .expect("note");

    let moved = crate::move_task(&db, "LOG-2", "spa")
        .await
        .expect("move epic");
    assert_eq!(moved.id.as_str(), "SPA-2");
    let items = list_plan_items(&db, &plan.id).await.expect("items");
    assert_eq!(
        items
            .iter()
            .map(|item| item.key.as_str())
            .collect::<Vec<_>>(),
        vec!["SPA-3", "SPA-2"]
    );
    assert_eq!(items[0].position, 1024);
    assert_eq!(items[1].position, 2048);
    let parent: Option<String> =
        sqlx::query_scalar("SELECT epic_id FROM tasks WHERE key = 'SPA-3'")
            .fetch_one(db.pool())
            .await
            .expect("parent");
    assert_eq!(parent.as_deref(), Some(epic_uuid.0.as_str()));
    let notes = list_plan_notes(&db, &plan.id).await.expect("notes");
    assert_eq!(notes[0].id, note.id);
    assert_eq!(notes[0].key, "SPA-3");
    assert_eq!(
        crate::plan_counts(&db, &plan.id)
            .await
            .expect("counts")
            .tasks,
        1
    );
    assert_eq!(
        crate::plan_counts(&db, &plan.id)
            .await
            .expect("counts")
            .epics,
        1
    );

    crate::delete_task(&db, "SPA-3")
        .await
        .expect("delete child");
    let items = list_plan_items(&db, &plan.id).await.expect("items");
    assert!(items[0].deleted);
    assert_eq!(items[0].position, 1024);
    let counts = crate::plan_counts(&db, &plan.id).await.expect("counts");
    assert_eq!(counts.tasks, 0);
    assert_eq!(counts.epics, 1);
    assert_eq!(
        list_plan_notes(&db, &plan.id).await.expect("notes").len(),
        1
    );

    crate::restore_task(&db, "SPA-3")
        .await
        .expect("restore child");
    let items = list_plan_items(&db, &plan.id).await.expect("items");
    assert!(!items[0].deleted);
    assert_eq!(
        crate::plan_counts(&db, &plan.id)
            .await
            .expect("counts")
            .tasks,
        1
    );

    delete_plan(&db, &plan.id).await.expect("delete plan");
    assert!(list_plans(&db).await.expect("plans").is_empty());
    assert_eq!(
        list_plan_items(&db, &plan.id).await.expect("items").len(),
        2
    );
    restore_plan(&db, &plan.id).await.expect("restore plan");
    assert_eq!(
        list_plan_items(&db, &plan.id).await.expect("items").len(),
        2
    );
    assert_eq!(
        list_plan_notes(&db, &plan.id).await.expect("notes").len(),
        1
    );
}

#[tokio::test]
async fn note_for_a_task_outside_the_plan_names_the_next_step() {
    let db = open().await;
    let plan = create_plan(&db, "Roadmap", "", PlanStatus::Active)
        .await
        .expect("plan");
    let err = add_plan_note(&db, &plan.id, "LOG-1", "note")
        .await
        .expect_err("note must fail");
    let message = err.to_string();
    assert!(message.contains("plans_items_add"), "{message}");
    assert!(message.contains("retry plans_notes_add"), "{message}");
}

#[tokio::test]
async fn notes_follow_the_task_key_and_survive_edits() {
    let db = open().await;
    let plan = create_plan(&db, "Roadmap", "", PlanStatus::Active)
        .await
        .expect("plan");
    add_plan_item(&db, &plan.id, "LOG-1").await.expect("add");
    let note = add_plan_note(&db, &plan.id, "LOG-1", " first ")
        .await
        .expect("note");
    assert_eq!(note.body, "first");
    assert_eq!(note.key, "LOG-1");

    edit_plan_note(&db, &note.id, "second", None)
        .await
        .expect("edit");
    let notes = list_plan_notes(&db, &plan.id).await.expect("notes");
    assert_eq!(notes[0].body, "second");
    let revisions: Vec<(String,)> = sqlx::query_as(
        "SELECT body FROM text_revisions WHERE entity = 'plan_note' AND entity_id = ?",
    )
    .bind(&note.id)
    .fetch_all(db.pool())
    .await
    .expect("revisions");
    assert_eq!(revisions[0].0, "first");

    delete_plan_note(&db, &note.id).await.expect("delete");
    assert!(
        list_plan_notes(&db, &plan.id)
            .await
            .expect("notes")
            .is_empty()
    );
}

#[tokio::test]
async fn note_versions_revisions_and_restore_are_consistent() {
    let db = open().await;
    let plan = create_plan(&db, "Roadmap", "", PlanStatus::Active)
        .await
        .expect("plan");
    add_plan_item(&db, &plan.id, "LOG-1").await.expect("add");
    let note = add_plan_note(&db, &plan.id, "LOG-1", "first")
        .await
        .expect("note");

    let stale = edit_plan_note(&db, &note.id, "stale", Some("wrong"))
        .await
        .expect_err("stale version");
    assert_eq!(stale.kind(), crate::AppErrorKind::Conflict);
    assert_eq!(
        list_plan_notes(&db, &plan.id).await.expect("notes")[0].body,
        "first"
    );
    assert!(
        list_plan_note_revisions(&db, &note.id)
            .await
            .expect("revisions")
            .is_empty()
    );

    let edited = edit_plan_note(&db, &note.id, "second", Some(&note.created_at))
        .await
        .expect("first edit");
    let revisions = list_plan_note_revisions(&db, &note.id)
        .await
        .expect("revisions");
    assert_eq!(revisions.len(), 1);
    assert_eq!(revisions[0].entity_id, note.id);
    assert_eq!(revisions[0].field, "body");
    assert_eq!(revisions[0].body, "first");

    let stale = edit_plan_note(&db, &note.id, "third", Some(&note.created_at))
        .await
        .expect_err("stale after edit");
    assert_eq!(stale.kind(), crate::AppErrorKind::Conflict);
    assert_eq!(
        list_plan_notes(&db, &plan.id).await.expect("notes")[0].body,
        "second"
    );

    let edited_at = edited.edited_at.clone().expect("edited_at");
    let edited_again = edit_plan_note(&db, &note.id, "third", Some(&edited_at))
        .await
        .expect("second edit");
    let revisions = list_plan_note_revisions(&db, &note.id)
        .await
        .expect("revisions");
    assert_eq!(revisions.len(), 2);
    assert_eq!(revisions[0].body, "second");
    assert_eq!(revisions[1].body, "first");

    delete_plan_note(&db, &note.id).await.expect("delete");
    assert!(
        list_plan_notes(&db, &plan.id)
            .await
            .expect("notes")
            .is_empty()
    );
    let deleted = list_deleted_plan_notes(&db, &plan.id)
        .await
        .expect("deleted notes");
    assert_eq!(deleted.len(), 1);
    assert_eq!(deleted[0].id, note.id);
    assert!(deleted[0].deleted_at.is_some());
    assert_eq!(
        list_plan_note_revisions(&db, &note.id)
            .await
            .expect("revisions")
            .len(),
        2
    );

    let restored = restore_plan_note(&db, &note.id).await.expect("restore");
    assert!(restored.deleted_at.is_none());
    assert_eq!(restored.body, edited_again.body);
    assert!(
        list_deleted_plan_notes(&db, &plan.id)
            .await
            .expect("deleted notes")
            .is_empty()
    );
    restore_plan_note(&db, &note.id)
        .await
        .expect("repeat restore");
    assert_eq!(
        list_plan_notes(&db, &plan.id).await.expect("notes").len(),
        1
    );
}
