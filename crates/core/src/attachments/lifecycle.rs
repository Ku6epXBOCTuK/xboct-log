use super::*;

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
    to_attachment(
        &Row {
            deleted_at: Some(now),
            ..row
        },
        false,
    )
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
    to_attachment(
        &Row {
            deleted_at: None,
            ..row
        },
        false,
    )
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
        )?,
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
    let new_id = AttachmentId::new();
    let extension = row
        .stored_name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_owned())
        .unwrap_or_default();
    let stored_name = if extension.is_empty() {
        new_id.as_str().to_owned()
    } else {
        format!("{new_id}.{extension}")
    };
    write_stored_file(media_dir, new_id.as_str(), &stored_name, &data).await?;

    let created_at = now_iso();
    let inserted = sqlx::query(
        "INSERT INTO task_attachments (id, task_id, file_name, mime_type, size, stored_name, created_at)
         VALUES (?, (SELECT id FROM tasks WHERE key = ?), ?, ?, ?, ?, ?)",
    )
    .bind(new_id.as_str())
    .bind(target_task_id)
    .bind(&row.file_name)
    .bind(&row.mime_type)
    .bind(row.size)
    .bind(&stored_name)
    .bind(&created_at)
    .execute(db.pool())
    .await;
    if let Err(error) = inserted {
        let _ = tokio::fs::remove_file(stored_path(media_dir, new_id.as_str(), &stored_name)).await;
        return Err(error.into());
    }

    Ok(Attachment {
        id: new_id.clone(),
        task_id: TaskKey::new(target_task_id),
        file_name: row.file_name,
        mime_type: row.mime_type,
        size: row.size,
        created_at,
        uri: attachment_uri(new_id.as_str()),
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
        id: AttachmentId::parse(&row.id)?,
        task_id: TaskKey::new(row.task_id),
        file_name: row.file_name,
        file_removed,
    })
}
