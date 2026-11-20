use schemars::JsonSchema;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Row, sqlite::SqliteRow};

use crate::{
    AppError, Db, Result, TaskKey,
    fetch::fetch_by_id,
    tasks::{now_iso, record_revision, resolve_task_id},
};

pub const MAX_COMMENT_BODY_LENGTH: usize = 20_000;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Comment {
    pub id: String,
    pub task_id: TaskKey,
    pub body: String,
    pub created_at: String,
    pub edited_at: Option<String>,
    pub deleted_at: Option<String>,
}

impl<'r> FromRow<'r, SqliteRow> for Comment {
    fn from_row(row: &'r SqliteRow) -> sqlx::Result<Self> {
        Ok(Comment {
            id: row.try_get("id")?,
            task_id: TaskKey::new(row.try_get::<String, _>("task_id")?),
            body: row.try_get("body")?,
            created_at: row.try_get("created_at")?,
            edited_at: row.try_get("edited_at")?,
            deleted_at: row.try_get("deleted_at")?,
        })
    }
}

const SELECT_COMMENT: &str = "SELECT c.id, tasks.key AS task_id, c.body, c.created_at, c.edited_at, c.deleted_at FROM task_comments c JOIN tasks ON tasks.id = c.task_id";

pub async fn get_comment(db: &Db, id: &str) -> Result<Option<Comment>> {
    fetch_by_id(
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "{SELECT_COMMENT} WHERE c.id = ?"
        )))
        .bind(id),
        db.pool(),
    )
    .await
}

pub async fn list_comments(db: &Db, task_id: &str) -> Result<Vec<Comment>> {
    let rows = sqlx::query_as::<_, Comment>(sqlx::AssertSqlSafe(format!(
        "{SELECT_COMMENT} WHERE tasks.key = ? AND c.deleted_at IS NULL ORDER BY c.created_at ASC, c.rowid ASC"
    )))
    .bind(task_id)
    .fetch_all(db.pool())
    .await?;
    Ok(rows)
}

fn normalize_body(body: &str) -> Result<String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("comment body is required"));
    }
    if trimmed.encode_utf16().count() > MAX_COMMENT_BODY_LENGTH {
        return Err(AppError::validation(format!(
            "comment body is longer than {MAX_COMMENT_BODY_LENGTH} characters"
        )));
    }
    Ok(trimmed.to_owned())
}

pub async fn add_comment(db: &Db, task_id: &str, body: &str) -> Result<Comment> {
    let key = resolve_task_id(db, task_id).await?;
    let body = normalize_body(body)?;
    let id = uuid::Uuid::now_v7().to_string();
    let now = now_iso();

    sqlx::query(
        "INSERT INTO task_comments (id, task_id, body, created_at) VALUES (?, (SELECT id FROM tasks WHERE key = ?), ?, ?)",
    )
    .bind(&id)
    .bind(key.as_str())
    .bind(&body)
    .bind(&now)
    .execute(db.pool())
    .await?;

    get_comment(db, &id)
        .await?
        .ok_or_else(|| AppError::not_found(format!("comment {id} not found")))
}

pub async fn edit_comment(db: &Db, id: &str, body: &str) -> Result<Comment> {
    let current = get_comment(db, id)
        .await?
        .filter(|comment| comment.deleted_at.is_none())
        .ok_or_else(|| AppError::not_found(format!("comment {id} not found")))?;
    let next = normalize_body(body)?;
    if next == current.body {
        return Ok(current);
    }

    let now = now_iso();
    let mut tx = db.begin().await?;
    record_revision(
        &mut tx,
        current.task_id.as_str(),
        "comment",
        Some(current.id.as_str()),
        &current.body,
        Utc::now(),
    )
    .await?;
    sqlx::query("UPDATE task_comments SET body = ?, edited_at = ? WHERE id = ?")
        .bind(&next)
        .bind(&now)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    get_comment(db, id)
        .await?
        .ok_or_else(|| AppError::not_found(format!("comment {id} not found")))
}

pub async fn delete_comment(db: &Db, id: &str) -> Result<Comment> {
    get_comment(db, id)
        .await?
        .filter(|comment| comment.deleted_at.is_none())
        .ok_or_else(|| AppError::not_found(format!("comment {id} not found")))?;

    sqlx::query("UPDATE task_comments SET deleted_at = ? WHERE id = ?")
        .bind(now_iso())
        .bind(id)
        .execute(db.pool())
        .await?;

    get_comment(db, id)
        .await?
        .ok_or_else(|| AppError::not_found(format!("comment {id} not found")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_bodies_like_node() {
        assert_eq!(normalize_body("  hi  ").unwrap(), "hi");
        assert_eq!(
            normalize_body("   ").unwrap_err().message(),
            "comment body is required"
        );
        let long = "a".repeat(MAX_COMMENT_BODY_LENGTH + 1);
        assert_eq!(
            normalize_body(&long).unwrap_err().message(),
            "comment body is longer than 20000 characters"
        );
    }
}
