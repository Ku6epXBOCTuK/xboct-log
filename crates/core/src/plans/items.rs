use schemars::JsonSchema;
use serde::Serialize;
use sqlx::{FromRow, Row};

use crate::{
    AppError, Db, PlanNoteId, Result, TaskUuid, TextRevision, common::now_iso, fetch::fetch_by_id,
    require_plan, resolve_plan_id, resolve_task_id,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct PlanItem {
    pub key: String,
    pub title: String,
    pub project_id: String,
    pub is_epic: bool,
    pub position: i64,
    pub deleted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema, FromRow)]
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

async fn task_uuid(db: &Db, key: &str) -> Result<TaskUuid> {
    let row: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT id, deleted_at FROM tasks WHERE key = ?")
            .bind(key)
            .fetch_optional(db.pool())
            .await?;
    match row {
        Some((id, None)) => TaskUuid::parse(&id),
        Some((_, Some(_))) => Err(AppError::validation(format!("task {key} is deleted"))),
        None => Err(AppError::not_found(format!("task {key} not found"))),
    }
}

pub async fn list_plan_items(db: &Db, plan_id: &str) -> Result<Vec<PlanItem>> {
    let plan_id = resolve_plan_id(db, plan_id).await?;
    let rows = sqlx::query(
        "SELECT t.key, t.title, t.project_id, t.is_epic, t.deleted_at, pi.position
         FROM plan_items pi
         JOIN tasks t ON t.id = pi.task_id
         WHERE pi.plan_id = ?
         ORDER BY pi.position, t.key",
    )
    .bind(&plan_id)
    .fetch_all(db.pool())
    .await?;
    rows.iter().map(row_to_item).collect()
}

pub async fn add_plan_item(db: &Db, plan_id: &str, task_id: &str) -> Result<PlanItem> {
    let plan_id = resolve_plan_id(db, plan_id).await?;
    require_plan(db, &plan_id).await?;
    let key = resolve_task_id(db, task_id).await?;
    let uuid = task_uuid(db, key.as_str()).await?;
    let existing: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM plan_items WHERE plan_id = ? AND task_id = ?")
            .bind(&plan_id)
            .bind(uuid.as_str())
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
    .bind(&plan_id)
    .fetch_one(db.pool())
    .await?;
    sqlx::query("INSERT INTO plan_items (plan_id, task_id, position) VALUES (?, ?, ?)")
        .bind(&plan_id)
        .bind(uuid.as_str())
        .bind(position)
        .execute(db.pool())
        .await?;
    list_plan_items(db, &plan_id)
        .await?
        .into_iter()
        .find(|item| item.key == key.as_str())
        .ok_or_else(|| AppError::unexpected(format!("item {key} was not added")))
}

pub async fn remove_plan_item(db: &Db, plan_id: &str, task_id: &str) -> Result<Option<PlanItem>> {
    let plan_id = resolve_plan_id(db, plan_id).await?;
    require_plan(db, &plan_id).await?;
    let key = resolve_task_id(db, task_id).await?;
    let uuid = task_uuid(db, key.as_str()).await?;
    let removed = list_plan_items(db, &plan_id)
        .await?
        .into_iter()
        .find(|item| item.key == key.as_str());
    sqlx::query("DELETE FROM plan_items WHERE plan_id = ? AND task_id = ?")
        .bind(&plan_id)
        .bind(uuid.as_str())
        .execute(db.pool())
        .await?;
    Ok(removed)
}

pub async fn reorder_plan_items(db: &Db, plan_id: &str, keys: &[String]) -> Result<Vec<PlanItem>> {
    let plan_id = resolve_plan_id(db, plan_id).await?;
    require_plan(db, &plan_id).await?;
    let mut tx = db.begin().await?;
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT pi.task_id, t.key FROM plan_items pi
         JOIN tasks t ON t.id = pi.task_id
         WHERE pi.plan_id = ?",
    )
    .bind(&plan_id)
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
        .bind(&plan_id)
        .execute(&mut *tx)
        .await?;
    for (index, id) in ids.iter().enumerate() {
        sqlx::query("UPDATE plan_items SET position = ? WHERE plan_id = ? AND task_id = ?")
            .bind((index as i64 + 1) * 1024)
            .bind(&plan_id)
            .bind(*id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    list_plan_items(db, &plan_id).await
}

pub async fn list_plan_notes(db: &Db, plan_id: &str) -> Result<Vec<PlanNote>> {
    let plan_id = resolve_plan_id(db, plan_id).await?;
    let rows = sqlx::query_as::<_, PlanNote>(
        "SELECT pn.id, pn.plan_id, pn.body, pn.created_at, pn.edited_at, pn.deleted_at, t.key
         FROM plan_notes pn
         JOIN tasks t ON t.id = pn.task_id
         WHERE pn.plan_id = ? AND pn.deleted_at IS NULL
         ORDER BY pn.created_at, pn.id",
    )
    .bind(&plan_id)
    .fetch_all(db.pool())
    .await?;
    Ok(rows)
}

async fn require_plan_item(db: &Db, plan_id: &str, task_id: &str) -> Result<TaskUuid> {
    let plan_id = resolve_plan_id(db, plan_id).await?;
    let key = resolve_task_id(db, task_id).await?;
    let uuid = task_uuid(db, key.as_str()).await?;
    let member: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM plan_items WHERE plan_id = ? AND task_id = ?")
            .bind(&plan_id)
            .bind(uuid.as_str())
            .fetch_optional(db.pool())
            .await?;
    if member.is_none() {
        return Err(AppError::validation(format!(
            "task {key} is not an item of plan {plan_id}; add it to the plan with plans_items_add, then retry plans_notes_add"
        )));
    }
    Ok(uuid)
}

pub async fn add_plan_note(db: &Db, plan_id: &str, task_id: &str, body: &str) -> Result<PlanNote> {
    let plan_id = resolve_plan_id(db, plan_id).await?;
    require_plan(db, &plan_id).await?;
    let body = body.trim();
    if body.is_empty() {
        return Err(AppError::validation("note body is required"));
    }
    let uuid = require_plan_item(db, &plan_id, task_id).await?;
    let id = PlanNoteId::new();
    let now = now_iso();
    sqlx::query(
        "INSERT INTO plan_notes (id, plan_id, task_id, body, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id.as_str())
    .bind(&plan_id)
    .bind(uuid.as_str())
    .bind(body)
    .bind(&now)
    .execute(db.pool())
    .await?;
    get_plan_note(db, id.as_str()).await
}

async fn get_plan_note(db: &Db, id: &str) -> Result<PlanNote> {
    fetch_by_id(
        sqlx::query(
            "SELECT pn.id, pn.plan_id, pn.body, pn.created_at, pn.edited_at, pn.deleted_at, t.key
             FROM plan_notes pn
             JOIN tasks t ON t.id = pn.task_id
             WHERE pn.id = ?",
        )
        .bind(id),
        db.pool(),
    )
    .await?
    .ok_or_else(|| AppError::not_found(format!("plan note {id} not found")))
}

pub async fn edit_plan_note(
    db: &Db,
    id: &str,
    body: &str,
    expected_edited_at: Option<&str>,
) -> Result<PlanNote> {
    let body = body.trim();
    if body.is_empty() {
        return Err(AppError::validation("note body is required"));
    }
    let mut tx = db.begin().await?;
    let current = fetch_by_id::<PlanNote, _>(
        sqlx::query(
            "SELECT pn.id, pn.plan_id, pn.body, pn.created_at, pn.edited_at, pn.deleted_at, t.key
             FROM plan_notes pn
             JOIN tasks t ON t.id = pn.task_id
             WHERE pn.id = ?",
        )
        .bind(id),
        &mut *tx,
    )
    .await?
    .ok_or_else(|| AppError::not_found(format!("plan note {id} not found")))?;
    if current.deleted_at.is_some() {
        return Err(AppError::not_found(format!("plan note {id} not found")));
    }
    let version = current
        .edited_at
        .as_deref()
        .unwrap_or(current.created_at.as_str());
    if let Some(expected) = expected_edited_at
        && expected != version
    {
        return Err(AppError::conflict(format!(
            "plan note {id} changed since {expected}"
        )));
    }
    if current.body != body {
        let now = now_iso();
        sqlx::query(
            "INSERT INTO text_revisions (entity, entity_id, field, body, created_at)
             VALUES ('plan_note', ?, 'body', ?, ?)",
        )
        .bind(&current.id)
        .bind(&current.body)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE plan_notes SET body = ?, edited_at = ? WHERE id = ?")
            .bind(body)
            .bind(&now)
            .bind(&current.id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    get_plan_note(db, &current.id).await
}

pub async fn delete_plan_note(db: &Db, id: &str) -> Result<PlanNote> {
    let current = get_plan_note(db, id).await?;
    if current.deleted_at.is_none() {
        let now = now_iso();
        sqlx::query("UPDATE plan_notes SET deleted_at = ? WHERE id = ?")
            .bind(&now)
            .bind(&current.id)
            .execute(db.pool())
            .await?;
    }
    get_plan_note(db, &current.id).await
}

pub async fn restore_plan_note(db: &Db, id: &str) -> Result<PlanNote> {
    let current = get_plan_note(db, id).await?;
    if current.deleted_at.is_some() {
        sqlx::query("UPDATE plan_notes SET deleted_at = NULL WHERE id = ?")
            .bind(&current.id)
            .execute(db.pool())
            .await?;
    }
    get_plan_note(db, &current.id).await
}

pub async fn list_deleted_plan_notes(db: &Db, plan_id: &str) -> Result<Vec<PlanNote>> {
    let plan_id = resolve_plan_id(db, plan_id).await?;
    let rows = sqlx::query_as::<_, PlanNote>(
        "SELECT pn.id, pn.plan_id, pn.body, pn.created_at, pn.edited_at, pn.deleted_at, t.key
         FROM plan_notes pn
         JOIN tasks t ON t.id = pn.task_id
         WHERE pn.plan_id = ? AND pn.deleted_at IS NOT NULL
         ORDER BY pn.deleted_at DESC, pn.id",
    )
    .bind(&plan_id)
    .fetch_all(db.pool())
    .await?;
    Ok(rows)
}

pub async fn list_plan_note_revisions(db: &Db, id: &str) -> Result<Vec<TextRevision>> {
    get_plan_note(db, id).await?;
    let rows = sqlx::query(
        "SELECT id, entity, entity_id, field, body, created_at FROM text_revisions
         WHERE entity = 'plan_note' AND entity_id = ? ORDER BY id DESC",
    )
    .bind(id)
    .fetch_all(db.pool())
    .await?;
    rows.iter()
        .map(|row| {
            Ok(TextRevision {
                id: row.get("id"),
                entity: row.get("entity"),
                entity_id: row.get("entity_id"),
                field: row.get("field"),
                body: row.get("body"),
                created_at: row.get("created_at"),
            })
        })
        .collect()
}
#[cfg(test)]
mod tests;
