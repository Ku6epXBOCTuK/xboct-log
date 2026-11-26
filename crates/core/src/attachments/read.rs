use super::*;

pub async fn list_attachments(db: &Db, media_dir: &Path, task_id: &str) -> Result<Vec<Attachment>> {
    with_missing(media_dir, rows_of(db, Some(task_id)).await?).await
}

pub async fn list_all_attachments(db: &Db, media_dir: &Path) -> Result<Vec<Attachment>> {
    with_missing(media_dir, rows_of(db, None).await?).await
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
            attachment: to_attachment(&row, missing)?,
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
    Ok(Some(to_attachment(&row, missing)?))
}

pub async fn verify_attachments(
    db: &Db,
    media_dir: &Path,
    task_id: Option<&str>,
) -> Result<AttachmentCheck> {
    let mut check = AttachmentCheck::default();
    for item in with_missing(media_dir, rows_of(db, task_id).await?).await? {
        if item.missing {
            check.missing.push(item);
        } else {
            check.ok.push(item);
        }
    }
    Ok(check)
}
