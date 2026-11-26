use super::*;

pub(crate) fn safe_name(name: &str) -> String {
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

pub(crate) async fn write_stored_file(
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
    let id = AttachmentId::new();
    let extension = extension_of(file_name).unwrap_or_default();
    let stored_name = format!("{id}.{extension}");
    write_stored_file(media_dir, id.as_str(), &stored_name, data).await?;

    let created_at = now_iso();
    sqlx::query(
        "INSERT INTO task_attachments (id, task_id, file_name, mime_type, size, stored_name, created_at)
         VALUES (?, (SELECT id FROM tasks WHERE key = ?), ?, ?, ?, ?, ?)",
    )
    .bind(id.as_str())
    .bind(task_id)
    .bind(&name)
    .bind(format.mime)
    .bind(data.len() as i64)
    .bind(&stored_name)
    .bind(&created_at)
    .execute(db.pool())
    .await?;

    Ok(Attachment {
        id: id.clone(),
        task_id: TaskKey::new(task_id),
        file_name: name,
        mime_type: Some(format.mime.to_owned()),
        size: data.len() as i64,
        created_at,
        uri: attachment_uri(id.as_str()),
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

pub(crate) fn decode_base64(value: &str) -> Option<Vec<u8>> {
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
