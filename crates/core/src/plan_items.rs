use schemars::JsonSchema;
use serde::Serialize;
use sqlx::Row;

use crate::{AppError, Db, Result, now_iso, require_plan, resolve_task_id};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct PlanItem {
    pub key: String,
    pub title: String,
    pub project_id: String,
    pub is_epic: bool,
    pub position: i64,
    pub deleted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct PlanNote {
    pub id: String,
    pub plan_id: String,
    pub key: String,
    pub body: String,
    pub created_at: String,
    pub edited_at: Option<String>,
    pub deleted_at: Option<String>,
}

fn row_to_item(row: &sqlx::sqlite::SqliteRow) -> Result<PlanItem> {
    Ok(PlanItem {
        key: row.get("key"),
        title: row.get("title"),
        project_id: row.get("project_id"),
        is_epic: row.get::<i64, _>("is_epic") == 1,
        position: row.get("position"),
        deleted: row.get::<Option<String>, _>("deleted_at").is_some(),
    })
}

fn row_to_note(row: &sqlx::sqlite::SqliteRow) -> Result<PlanNote> {
    Ok(PlanNote {
        id: row.get("id"),
        plan_id: row.get("plan_id"),
        key: row.get("key"),
        body: row.get("body"),
        created_at: row.get("created_at"),
        edited_at: row.get("edited_at"),
        deleted_at: row.get("deleted_at"),
    })
}

async fn task_uuid(db: &Db, key: &str) -> Result<String> {
    let row: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT id, deleted_at FROM tasks WHERE key = ?")
            .bind(key)
            .fetch_optional(db.pool())
            .await?;
    match row {
        Some((id, None)) => Ok(id),
        Some((_, Some(_))) => Err(AppError::validation(format!("task {key} is deleted"))),
        None => Err(AppError::not_found(format!("task {key} not found"))),
    }
}

pub async fn list_plan_items(db: &Db, plan_id: &str) -> Result<Vec<PlanItem>> {
    let rows = sqlx::query(
        "SELECT t.key, t.title, t.project_id, t.is_epic, t.deleted_at, pi.position
         FROM plan_items pi
         JOIN tasks t ON t.id = pi.task_id
         WHERE pi.plan_id = ?
         ORDER BY pi.position, t.key",
    )
    .bind(plan_id)
    .fetch_all(db.pool())
    .await?;
    rows.iter().map(row_to_item).collect()
}

pub async fn add_plan_item(db: &Db, plan_id: &str, task_id: &str) -> Result<PlanItem> {
    require_plan(db, plan_id).await?;
    let key = resolve_task_id(db, task_id).await?;
    let uuid = task_uuid(db, key.as_str()).await?;
    let existing: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM plan_items WHERE plan_id = ? AND task_id = ?")
            .bind(plan_id)
            .bind(&uuid)
            .fetch_optional(db.pool())
            .await?;
    if existing.is_some() {
        return Err(AppError::conflict(format!(
            "task {key} is already in plan {plan_id}"
        )));
    }
    let position: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(position), 0) + 1024 FROM plan_items WHERE plan_id = ?",
    )
    .bind(plan_id)
    .fetch_one(db.pool())
    .await?;
    sqlx::query("INSERT INTO plan_items (plan_id, task_id, position) VALUES (?, ?, ?)")
        .bind(plan_id)
        .bind(&uuid)
        .bind(position)
        .execute(db.pool())
        .await?;
    list_plan_items(db, plan_id)
        .await?
        .into_iter()
        .find(|item| item.key == key.as_str())
        .ok_or_else(|| AppError::unexpected(format!("item {key} was not added")))
}

pub async fn remove_plan_item(db: &Db, plan_id: &str, task_id: &str) -> Result<Option<PlanItem>> {
    require_plan(db, plan_id).await?;
    let key = resolve_task_id(db, task_id).await?;
    let uuid = task_uuid(db, key.as_str()).await?;
    let removed = list_plan_items(db, plan_id)
        .await?
        .into_iter()
        .find(|item| item.key == key.as_str());
    sqlx::query("DELETE FROM plan_items WHERE plan_id = ? AND task_id = ?")
        .bind(plan_id)
        .bind(&uuid)
        .execute(db.pool())
        .await?;
    Ok(removed)
}

pub async fn reorder_plan_items(db: &Db, plan_id: &str, keys: &[String]) -> Result<Vec<PlanItem>> {
    require_plan(db, plan_id).await?;
    let mut tx = db.begin().await?;
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT pi.task_id, t.key FROM plan_items pi
         JOIN tasks t ON t.id = pi.task_id
         WHERE pi.plan_id = ?",
    )
    .bind(plan_id)
    .fetch_all(&mut *tx)
    .await?;
    if rows.len() != keys.len() {
        return Err(AppError::validation(format!(
            "plan {plan_id} has {} items, reorder lists {}",
            rows.len(),
            keys.len()
        )));
    }
    let by_key: std::collections::BTreeMap<&str, &str> = rows
        .iter()
        .map(|(id, key)| (key.as_str(), id.as_str()))
        .collect();
    let mut ids: Vec<&str> = Vec::with_capacity(keys.len());
    for key in keys {
        let id = by_key.get(key.as_str()).ok_or_else(|| {
            AppError::validation(format!("key {key} is not an item of plan {plan_id}"))
        })?;
        if ids.contains(id) {
            return Err(AppError::validation(format!(
                "duplicate key {key} in reorder"
            )));
        }
        ids.push(id);
    }
    sqlx::query("UPDATE plan_items SET position = -1 WHERE plan_id = ?")
        .bind(plan_id)
        .execute(&mut *tx)
        .await?;
    for (index, id) in ids.iter().enumerate() {
        sqlx::query("UPDATE plan_items SET position = ? WHERE plan_id = ? AND task_id = ?")
            .bind((index as i64 + 1) * 1024)
            .bind(plan_id)
            .bind(*id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    list_plan_items(db, plan_id).await
}

pub async fn list_plan_notes(db: &Db, plan_id: &str) -> Result<Vec<PlanNote>> {
    let rows = sqlx::query(
        "SELECT pn.id, pn.plan_id, pn.body, pn.created_at, pn.edited_at, pn.deleted_at, t.key
         FROM plan_notes pn
         JOIN tasks t ON t.id = pn.task_id
         WHERE pn.plan_id = ? AND pn.deleted_at IS NULL
         ORDER BY pn.created_at, pn.id",
    )
    .bind(plan_id)
    .fetch_all(db.pool())
    .await?;
    rows.iter().map(row_to_note).collect()
}

async fn require_plan_item(db: &Db, plan_id: &str, task_id: &str) -> Result<String> {
    let key = resolve_task_id(db, task_id).await?;
    let uuid = task_uuid(db, key.as_str()).await?;
    let member: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM plan_items WHERE plan_id = ? AND task_id = ?")
            .bind(plan_id)
            .bind(&uuid)
            .fetch_optional(db.pool())
            .await?;
    if member.is_none() {
        return Err(AppError::validation(format!(
            "task {key} is not an item of plan {plan_id}"
        )));
    }
    Ok(uuid)
}

pub async fn add_plan_note(db: &Db, plan_id: &str, task_id: &str, body: &str) -> Result<PlanNote> {
    require_plan(db, plan_id).await?;
    let body = body.trim();
    if body.is_empty() {
        return Err(AppError::validation("note body is required"));
    }
    let uuid = require_plan_item(db, plan_id, task_id).await?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();
    sqlx::query(
        "INSERT INTO plan_notes (id, plan_id, task_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(plan_id)
    .bind(&uuid)
    .bind(body)
    .bind(&now)
    .execute(db.pool())
    .await?;
    get_plan_note(db, &id).await
}

async fn get_plan_note(db: &Db, id: &str) -> Result<PlanNote> {
    let row = sqlx::query(
        "SELECT pn.id, pn.plan_id, pn.body, pn.created_at, pn.edited_at, pn.deleted_at, t.key
         FROM plan_notes pn
         JOIN tasks t ON t.id = pn.task_id
         WHERE pn.id = ?",
    )
    .bind(id)
    .fetch_optional(db.pool())
    .await?
    .ok_or_else(|| AppError::not_found(format!("plan note {id} not found")))?;
    row_to_note(&row)
}

pub async fn edit_plan_note(db: &Db, id: &str, body: &str) -> Result<PlanNote> {
    let body = body.trim();
    if body.is_empty() {
        return Err(AppError::validation("note body is required"));
    }
    let current = get_plan_note(db, id).await?;
    if current.deleted_at.is_some() {
        return Err(AppError::not_found(format!("plan note {id} not found")));
    }
    if current.body != body {
        let now = now_iso();
        sqlx::query(
            "INSERT INTO text_revisions (entity, entity_id, field, body, created_at)
             VALUES ('plan_note', ?, 'body', ?, ?)",
        )
        .bind(id)
        .bind(&current.body)
        .bind(&now)
        .execute(db.pool())
        .await?;
        sqlx::query("UPDATE plan_notes SET body = ?, edited_at = ? WHERE id = ?")
            .bind(body)
            .bind(&now)
            .bind(id)
            .execute(db.pool())
            .await?;
    }
    get_plan_note(db, id).await
}

pub async fn delete_plan_note(db: &Db, id: &str) -> Result<PlanNote> {
    let current = get_plan_note(db, id).await?;
    if current.deleted_at.is_none() {
        let now = now_iso();
        sqlx::query("UPDATE plan_notes SET deleted_at = ? WHERE id = ?")
            .bind(&now)
            .bind(id)
            .execute(db.pool())
            .await?;
    }
    get_plan_note(db, id).await
}

#[cfg(test)]
mod tests {
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
            sqlx::query(
                "INSERT INTO tasks (id, project_id, number, is_epic, key, title, status, priority, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, 'task', 'backlog', 'medium', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
            )
            .bind(key)
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

        let reordered =
            reorder_plan_items(&db, &plan.id, &["SPA-1".to_string(), "LOG-1".to_string()])
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

        edit_plan_note(&db, &note.id, "second").await.expect("edit");
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
}
