use schemars::JsonSchema;

use std::path::Path;

use serde::Serialize;
use sqlx::FromRow;

use crate::common::now_iso;
use crate::fetch::fetch_by_id;
use crate::ids::{AttachmentId, TaskKey};
use crate::media::{attachment_format, extension_of, stored_path};
use crate::{AppError, Db, Result};

pub const MAX_ATTACHMENT_SIZE: u64 = 20 * 1024 * 1024;
pub const ATTACHMENT_PURGE_KEEP_DAYS: i64 = 30;

const COLUMNS: &str = "a.id, t.key AS task_id, a.file_name, a.mime_type, a.size, a.stored_name, a.created_at, a.deleted_at";

#[derive(Debug, Clone, FromRow)]
struct Row {
    id: String,
    task_id: String,
    file_name: String,
    mime_type: Option<String>,
    size: i64,
    stored_name: String,
    created_at: String,
    deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct Attachment {
    pub id: AttachmentId,
    pub task_id: TaskKey,
    pub file_name: String,
    pub mime_type: Option<String>,
    pub size: i64,
    pub created_at: String,
    pub uri: String,
    pub missing: bool,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct DeletedAttachment {
    #[serde(flatten)]
    pub attachment: Attachment,
    pub task_title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct MovedAttachment {
    pub item: Attachment,
    pub previous_task_id: TaskKey,
    pub was_deleted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct PurgedAttachment {
    pub id: AttachmentId,
    pub task_id: TaskKey,
    pub file_name: String,
    pub file_removed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, JsonSchema)]
pub struct AttachmentCheck {
    pub ok: Vec<Attachment>,
    pub missing: Vec<Attachment>,
}

pub fn attachment_uri(id: &str) -> String {
    format!("xboct-log://attachment/{id}")
}

fn to_attachment(row: &Row, missing: bool) -> Result<Attachment> {
    Ok(Attachment {
        id: AttachmentId::parse(&row.id)?,
        task_id: TaskKey::new(row.task_id.clone()),
        file_name: row.file_name.clone(),
        mime_type: row.mime_type.clone(),
        size: row.size,
        created_at: row.created_at.clone(),
        uri: attachment_uri(&row.id),
        missing,
        deleted_at: row.deleted_at.clone(),
    })
}

async fn is_missing(media_dir: &Path, row: &Row) -> bool {
    tokio::fs::metadata(stored_path(media_dir, &row.id, &row.stored_name))
        .await
        .is_err()
}

async fn row_by_id(db: &Db, id: &str) -> Result<Option<Row>> {
    fetch_by_id(
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "SELECT {COLUMNS} FROM task_attachments a JOIN tasks t ON t.id = a.task_id WHERE a.id = ?"
        )))
        .bind(id),
        db.pool(),
    )
    .await
}

async fn rows_of(db: &Db, task_id: Option<&str>) -> Result<Vec<Row>> {
    let rows = match task_id {
        None => {
            let sql = format!(
                "SELECT {COLUMNS} FROM task_attachments a JOIN tasks t ON t.id = a.task_id
                 WHERE a.deleted_at IS NULL ORDER BY t.key ASC, a.created_at ASC"
            );
            sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(sql))
                .fetch_all(db.pool())
                .await?
        }
        Some(task_id) => {
            let sql = format!(
                "SELECT {COLUMNS} FROM task_attachments a JOIN tasks t ON t.id = a.task_id
                 WHERE t.key = ? AND a.deleted_at IS NULL ORDER BY a.created_at ASC, a.id ASC"
            );
            sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(sql))
                .bind(task_id)
                .fetch_all(db.pool())
                .await?
        }
    };
    Ok(rows)
}

type DeletedRow = (
    String,
    String,
    String,
    Option<String>,
    i64,
    String,
    String,
    Option<String>,
    Option<String>,
);

async fn deleted_rows_of(db: &Db, task_id: Option<&str>) -> Result<Vec<(Row, Option<String>)>> {
    let rows: Vec<DeletedRow> = match task_id {
        None => {
            let sql = format!(
                "SELECT {COLUMNS}, t.title AS task_title FROM task_attachments a
                 JOIN tasks t ON t.id = a.task_id WHERE a.deleted_at IS NOT NULL
                 ORDER BY a.deleted_at DESC, a.id ASC"
            );
            sqlx::query_as(sqlx::AssertSqlSafe(sql))
                .fetch_all(db.pool())
                .await?
        }
        Some(task_id) => {
            let sql = format!(
                "SELECT {COLUMNS}, t.title AS task_title FROM task_attachments a
                 JOIN tasks t ON t.id = a.task_id WHERE t.key = ? AND a.deleted_at IS NOT NULL
                 ORDER BY a.deleted_at DESC, a.id ASC"
            );
            sqlx::query_as(sqlx::AssertSqlSafe(sql))
                .bind(task_id)
                .fetch_all(db.pool())
                .await?
        }
    };
    Ok(rows
        .into_iter()
        .map(|row| {
            (
                Row {
                    id: row.0,
                    task_id: row.1,
                    file_name: row.2,
                    mime_type: row.3,
                    size: row.4,
                    stored_name: row.5,
                    created_at: row.6,
                    deleted_at: row.7,
                },
                row.8,
            )
        })
        .collect())
}

async fn with_missing(media_dir: &Path, rows: Vec<Row>) -> Result<Vec<Attachment>> {
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let missing = is_missing(media_dir, &row).await;
        items.push(to_attachment(&row, missing)?);
    }
    Ok(items)
}

mod lifecycle;
mod read;
mod write;
pub use lifecycle::{
    copy_attachment, delete_attachment, move_attachment, purge_attachment, restore_attachment,
};
pub use read::{
    attachment_by_id, list_all_attachments, list_attachments, list_deleted_attachments,
    verify_attachments,
};
pub(crate) use write::write_stored_file;
pub use write::{add_attachment, add_attachment_from_base64, add_attachment_from_path};
#[cfg(test)]
pub(crate) use write::{decode_base64, safe_name};

#[cfg(test)]
mod tests;
