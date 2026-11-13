use std::path::Path;

use serde::Serialize;
use sqlx::FromRow;
use uuid::Uuid;

use crate::ids::{AttachmentId, TaskKey};
use crate::media::{attachment_format, extension_of, stored_path};
use crate::tasks::now_iso;
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeletedAttachment {
    #[serde(flatten)]
    pub attachment: Attachment,
    pub task_title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MovedAttachment {
    pub item: Attachment,
    pub previous_task_id: TaskKey,
    pub was_deleted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PurgedAttachment {
    pub id: AttachmentId,
    pub task_id: TaskKey,
    pub file_name: String,
    pub file_removed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct AttachmentCheck {
    pub ok: Vec<Attachment>,
    pub missing: Vec<Attachment>,
}

pub fn attachment_uri(id: &str) -> String {
    format!("xboct-log://attachment/{id}")
}

fn to_attachment(row: &Row, missing: bool) -> Attachment {
    Attachment {
        id: AttachmentId::new(row.id.clone()),
        task_id: TaskKey::new(row.task_id.clone()),
        file_name: row.file_name.clone(),
        mime_type: row.mime_type.clone(),
        size: row.size,
        created_at: row.created_at.clone(),
        uri: attachment_uri(&row.id),
        missing,
        deleted_at: row.deleted_at.clone(),
    }
}

async fn is_missing(media_dir: &Path, row: &Row) -> bool {
    tokio::fs::metadata(stored_path(media_dir, &row.id, &row.stored_name))
        .await
        .is_err()
}

async fn row_by_id(db: &Db, id: &str) -> Result<Option<Row>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM task_attachments a JOIN tasks t ON t.id = a.task_id WHERE a.id = ?"
    );
    Ok(sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .fetch_optional(db.pool())
        .await?)
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

async fn with_missing(media_dir: &Path, rows: Vec<Row>) -> Vec<Attachment> {
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        let missing = is_missing(media_dir, &row).await;
        items.push(to_attachment(&row, missing));
    }
    items
}

pub async fn list_attachments(db: &Db, media_dir: &Path, task_id: &str) -> Result<Vec<Attachment>> {
    Ok(with_missing(media_dir, rows_of(db, Some(task_id)).await?).await)
}

pub async fn list_all_attachments(db: &Db, media_dir: &Path) -> Result<Vec<Attachment>> {
    Ok(with_missing(media_dir, rows_of(db, None).await?).await)
}

pub async fn list_deleted_attachments(
    db: &Db,
    media_dir: &Path,
    task_id: Option<&str>,
) -> Result<Vec<DeletedAttachment>> {
    let mut items = Vec::new();
    for (row, task_title) in deleted_rows_of(db, task_id).await? {
        let missing = is_missing(media_dir, &row).await;
        items.push(DeletedAttachment {
            attachment: to_attachment(&row, missing),
            task_title,
        });
    }
    Ok(items)
}

pub async fn attachment_by_id(db: &Db, media_dir: &Path, id: &str) -> Result<Option<Attachment>> {
    let Some(row) = row_by_id(db, id).await? else {
        return Ok(None);
    };
    let missing = is_missing(media_dir, &row).await;
    Ok(Some(to_attachment(&row, missing)))
}

pub async fn verify_attachments(
    db: &Db,
    media_dir: &Path,
    task_id: Option<&str>,
) -> Result<AttachmentCheck> {
    let mut check = AttachmentCheck::default();
    for item in with_missing(media_dir, rows_of(db, task_id).await?).await {
        if item.missing {
            check.missing.push(item);
        } else {
            check.ok.push(item);
        }
    }
    Ok(check)
}

fn safe_name(name: &str) -> String {
    let base = name.rsplit(['\\', '/']).next().unwrap_or("file").trim();
    let cleaned: String = base
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | '-' | ' ') {
                character
            } else {
                '_'
            }
        })
        .take(120)
        .collect();
    if cleaned.is_empty() {
        "file".to_owned()
    } else {
        cleaned
    }
}

async fn write_stored_file(
    media_dir: &Path,
    id: &str,
    stored_name: &str,
    data: &[u8],
) -> Result<()> {
    let path = stored_path(media_dir, id, stored_name);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(&path, data).await?;
    Ok(())
}

pub async fn add_attachment(
    db: &Db,
    media_dir: &Path,
    task_id: &str,
    file_name: &str,
    data: &[u8],
) -> Result<Attachment> {
    let format = attachment_format(file_name).ok_or_else(|| {
        AppError::validation(format!("the file type of {file_name} is not supported"))
    })?;
    let name = safe_name(file_name);
    if data.is_empty() {
        return Err(AppError::validation("the file is empty"));
    }
    if data.len() as u64 > MAX_ATTACHMENT_SIZE {
        let megabytes = (data.len() as f64 / 1024.0 / 1024.0).round() as i64;
        return Err(AppError::validation(format!(
            "the file is too large: {megabytes} MB, the limit is 20 MB"
        )));
    }
    let id = Uuid::new_v4().to_string();
    let extension = extension_of(file_name).unwrap_or_default();
    let stored_name = format!("{id}.{extension}");
    write_stored_file(media_dir, &id, &stored_name, data).await?;

    let created_at = now_iso();
    sqlx::query(
        "INSERT INTO task_attachments (id, task_id, file_name, mime_type, size, stored_name, created_at)
         VALUES (?, (SELECT id FROM tasks WHERE key = ?), ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(task_id)
    .bind(&name)
    .bind(format.mime)
    .bind(data.len() as i64)
    .bind(&stored_name)
    .bind(&created_at)
    .execute(db.pool())
    .await?;

    Ok(Attachment {
        id: AttachmentId::new(id.clone()),
        task_id: TaskKey::new(task_id),
        file_name: name,
        mime_type: Some(format.mime.to_owned()),
        size: data.len() as i64,
        created_at,
        uri: attachment_uri(&id),
        missing: false,
        deleted_at: None,
    })
}

pub async fn add_attachment_from_path(
    db: &Db,
    media_dir: &Path,
    task_id: &str,
    source_path: &str,
) -> Result<Attachment> {
    let data = tokio::fs::read(source_path)
        .await
        .map_err(|_| AppError::not_found(format!("the file {source_path} cannot be read")))?;
    add_attachment(db, media_dir, task_id, source_path, &data).await
}

pub async fn add_attachment_from_base64(
    db: &Db,
    media_dir: &Path,
    task_id: &str,
    file_name: &str,
    content: &str,
) -> Result<Attachment> {
    let cleaned: String = content
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect();
    let data = decode_base64(&cleaned)
        .ok_or_else(|| AppError::validation("the content is not valid base64"))?;
    add_attachment(db, media_dir, task_id, file_name, &data).await
}

fn decode_base64(value: &str) -> Option<Vec<u8>> {
    let (body, padding) = match value.find('=') {
        Some(index) => (&value[..index], &value[index..]),
        None => (value, ""),
    };
    if body.is_empty() || padding.len() > 2 || !padding.chars().all(|character| character == '=') {
        return None;
    }
    let mut accumulator: u32 = 0;
    let mut bits = 0;
    let mut output = Vec::new();
    for byte in body.bytes() {
        let six = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        };
        accumulator = (accumulator << 6) | u32::from(six);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((accumulator >> bits) as u8);
            accumulator &= (1 << bits) - 1;
        }
    }
    Some(output)
}

pub async fn delete_attachment(db: &Db, id: &str) -> Result<Attachment> {
    let row = row_by_id(db, id)
        .await?
        .filter(|row| row.deleted_at.is_none())
        .ok_or_else(|| AppError::not_found(format!("no attachment with the id {id}")))?;
    let now = now_iso();
    sqlx::query("UPDATE task_attachments SET deleted_at = ? WHERE id = ?")
        .bind(&now)
        .bind(id)
        .execute(db.pool())
        .await?;
    Ok(to_attachment(
        &Row {
            deleted_at: Some(now),
            ..row
        },
        false,
    ))
}

pub async fn restore_attachment(db: &Db, media_dir: &Path, id: &str) -> Result<Attachment> {
    let row = row_by_id(db, id)
        .await?
        .filter(|row| row.deleted_at.is_some())
        .ok_or_else(|| AppError::not_found(format!("no deleted attachment with the id {id}")))?;
    let deleted_at: Option<String> =
        sqlx::query_scalar("SELECT deleted_at FROM tasks WHERE key = ?")
            .bind(&row.task_id)
            .fetch_optional(db.pool())
            .await?
            .ok_or_else(|| {
                AppError::not_found(format!(
                    "the task {} of the attachment {id} is gone",
                    row.task_id
                ))
            })?;
    if deleted_at.is_some() {
        return Err(AppError::validation(format!(
            "the task {} is deleted: restore the task first",
            row.task_id
        )));
    }
    if tokio::fs::metadata(stored_path(media_dir, &row.id, &row.stored_name))
        .await
        .is_err()
    {
        return Err(AppError::not_found(format!(
            "the file {} of the attachment {id} is gone from the media folder, there is nothing to restore",
            row.file_name
        )));
    }
    sqlx::query("UPDATE task_attachments SET deleted_at = NULL WHERE id = ?")
        .bind(id)
        .execute(db.pool())
        .await?;
    Ok(to_attachment(
        &Row {
            deleted_at: None,
            ..row
        },
        false,
    ))
}

async fn task_deleted_at(db: &Db, task_id: &str) -> Result<Option<Option<String>>> {
    Ok(
        sqlx::query_scalar("SELECT deleted_at FROM tasks WHERE key = ?")
            .bind(task_id)
            .fetch_optional(db.pool())
            .await?,
    )
}

async fn check_target(db: &Db, id: &str, row: &Row, target: &str) -> Result<()> {
    if row.task_id == target {
        return Err(AppError::validation(format!(
            "the attachment {id} is already on the task {target}"
        )));
    }
    let deleted_at = task_deleted_at(db, target)
        .await?
        .ok_or_else(|| AppError::not_found(format!("the task {target} not found")))?;
    if deleted_at.is_some() {
        return Err(AppError::validation(format!(
            "the task {target} is deleted: restore the task first"
        )));
    }
    Ok(())
}

pub async fn move_attachment(
    db: &Db,
    media_dir: &Path,
    id: &str,
    target_task_id: &str,
) -> Result<MovedAttachment> {
    let row = row_by_id(db, id)
        .await?
        .ok_or_else(|| AppError::not_found(format!("no attachment with the id {id}")))?;
    check_target(db, id, &row, target_task_id).await?;
    sqlx::query(
        "UPDATE task_attachments SET task_id = (SELECT id FROM tasks WHERE key = ?), deleted_at = NULL
         WHERE id = ?",
    )
    .bind(target_task_id)
    .bind(id)
    .execute(db.pool())
    .await?;
    let missing = is_missing(media_dir, &row).await;
    let was_deleted = row.deleted_at.is_some();
    Ok(MovedAttachment {
        item: to_attachment(
            &Row {
                task_id: target_task_id.to_owned(),
                deleted_at: None,
                ..row.clone()
            },
            missing,
        ),
        previous_task_id: TaskKey::new(row.task_id),
        was_deleted,
    })
}

pub async fn copy_attachment(
    db: &Db,
    media_dir: &Path,
    id: &str,
    target_task_id: &str,
) -> Result<Attachment> {
    let row = row_by_id(db, id)
        .await?
        .ok_or_else(|| AppError::not_found(format!("no attachment with the id {id}")))?;
    check_target(db, id, &row, target_task_id).await?;
    let source = stored_path(media_dir, &row.id, &row.stored_name);
    let data = match tokio::fs::read(&source).await {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::not_found(format!(
                "the file {} of the attachment {id} is gone from the media folder, there is nothing to copy",
                row.file_name
            )));
        }
        Err(error) => return Err(error.into()),
    };
    let new_id = Uuid::new_v4().to_string();
    let extension = row
        .stored_name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_owned())
        .unwrap_or_default();
    let stored_name = if extension.is_empty() {
        new_id.clone()
    } else {
        format!("{new_id}.{extension}")
    };
    write_stored_file(media_dir, &new_id, &stored_name, &data).await?;

    let created_at = now_iso();
    let inserted = sqlx::query(
        "INSERT INTO task_attachments (id, task_id, file_name, mime_type, size, stored_name, created_at)
         VALUES (?, (SELECT id FROM tasks WHERE key = ?), ?, ?, ?, ?, ?)",
    )
    .bind(&new_id)
    .bind(target_task_id)
    .bind(&row.file_name)
    .bind(&row.mime_type)
    .bind(row.size)
    .bind(&stored_name)
    .bind(&created_at)
    .execute(db.pool())
    .await;
    if let Err(error) = inserted {
        let _ = tokio::fs::remove_file(stored_path(media_dir, &new_id, &stored_name)).await;
        return Err(error.into());
    }

    Ok(Attachment {
        id: AttachmentId::new(new_id.clone()),
        task_id: TaskKey::new(target_task_id),
        file_name: row.file_name,
        mime_type: row.mime_type,
        size: row.size,
        created_at,
        uri: attachment_uri(&new_id),
        missing: false,
        deleted_at: None,
    })
}

pub async fn purge_attachment(db: &Db, media_dir: &Path, id: &str) -> Result<PurgedAttachment> {
    let row = row_by_id(db, id)
        .await?
        .filter(|row| row.deleted_at.is_some())
        .ok_or_else(|| AppError::not_found(format!("no deleted attachment with the id {id}")))?;
    let path = stored_path(media_dir, &row.id, &row.stored_name);
    let file_removed = tokio::fs::metadata(&path).await.is_ok();
    if file_removed {
        let _ = tokio::fs::remove_file(&path).await;
    }
    sqlx::query("DELETE FROM task_attachments WHERE id = ?")
        .bind(id)
        .execute(db.pool())
        .await?;
    Ok(PurgedAttachment {
        id: AttachmentId::new(row.id),
        task_id: TaskKey::new(row.task_id),
        file_name: row.file_name,
        file_removed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_last_segment_of_a_path() {
        assert_eq!(safe_name("C:/logs/today log.txt"), "today log.txt");
        assert_eq!(safe_name("a/b/../../etc/passwd"), "passwd");
        assert_eq!(safe_name("   "), "file");
        assert_eq!(safe_name("отчёт.txt"), "_____.txt");
    }

    #[test]
    fn decodes_base64_leniently_like_node() {
        assert_eq!(decode_base64("cGFyaXR5"), Some(b"parity".to_vec()));
        assert_eq!(decode_base64("cGFyaXR5="), Some(b"parity".to_vec()));
        assert_eq!(decode_base64("cGFyaXR5=="), Some(b"parity".to_vec()));
        assert_eq!(decode_base64("cGFyaXR5==="), None);
        assert_eq!(decode_base64(""), None);
    }
}
