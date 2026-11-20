use std::path::{Path, PathBuf};

use crate::fetch::fetch_by_id;
use crate::{AppError, Db, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttachmentKind {
    Image,
    Pdf,
    Text,
    File,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AttachmentFormat {
    pub mime: &'static str,
    pub kind: AttachmentKind,
}

pub fn extension_of(name: &str) -> Option<String> {
    let dot = name.rfind('.')?;
    let extension = name.get(dot + 1..)?.to_lowercase();
    if extension.is_empty()
        || extension.len() > 10
        || !extension
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        return None;
    }
    Some(extension)
}

pub fn attachment_format(file_name: &str) -> Option<AttachmentFormat> {
    let extension = extension_of(file_name)?;
    let (mime, kind) = match extension.as_str() {
        "png" => ("image/png", AttachmentKind::Image),
        "jpg" | "jpeg" => ("image/jpeg", AttachmentKind::Image),
        "gif" => ("image/gif", AttachmentKind::Image),
        "webp" => ("image/webp", AttachmentKind::Image),
        "avif" => ("image/avif", AttachmentKind::Image),
        "bmp" => ("image/bmp", AttachmentKind::Image),
        "ico" => ("image/x-icon", AttachmentKind::Image),
        "pdf" => ("application/pdf", AttachmentKind::Pdf),
        "txt" => ("text/plain", AttachmentKind::Text),
        "md" => ("text/markdown", AttachmentKind::Text),
        "json" => ("application/json", AttachmentKind::Text),
        "csv" => ("text/csv", AttachmentKind::Text),
        "log" => ("text/plain", AttachmentKind::Text),
        "yml" | "yaml" => ("text/yaml", AttachmentKind::Text),
        "toml" => ("text/toml", AttachmentKind::Text),
        "ini" | "env" => ("text/plain", AttachmentKind::Text),
        "xml" => ("text/xml", AttachmentKind::Text),
        "zip" => ("application/zip", AttachmentKind::File),
        "7z" => ("application/x-7z-compressed", AttachmentKind::File),
        "rar" => ("application/vnd.rar", AttachmentKind::File),
        "tar" => ("application/x-tar", AttachmentKind::File),
        "gz" => ("application/gzip", AttachmentKind::File),
        "doc" => ("application/msword", AttachmentKind::File),
        "docx" => (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            AttachmentKind::File,
        ),
        "xls" => ("application/vnd.ms-excel", AttachmentKind::File),
        "xlsx" => (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            AttachmentKind::File,
        ),
        "ppt" => ("application/vnd.ms-powerpoint", AttachmentKind::File),
        "pptx" => (
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            AttachmentKind::File,
        ),
        _ => return None,
    };
    Some(AttachmentFormat { mime, kind })
}

pub fn stored_path(media_dir: &Path, id: &str, stored_name: &str) -> PathBuf {
    let prefix = id.get(..2).unwrap_or(id);
    media_dir.join(prefix).join(stored_name)
}

#[derive(Debug)]
pub struct AttachmentContents {
    pub file_name: String,
    pub data: Vec<u8>,
}

pub async fn read_attachment_file(
    db: &Db,
    media_dir: &Path,
    id: &str,
) -> Result<AttachmentContents> {
    read_stored(db, media_dir, id, false).await
}

pub async fn read_deleted_attachment_file(
    db: &Db,
    media_dir: &Path,
    id: &str,
) -> Result<AttachmentContents> {
    read_stored(db, media_dir, id, true).await
}

async fn read_stored(
    db: &Db,
    media_dir: &Path,
    id: &str,
    deleted: bool,
) -> Result<AttachmentContents> {
    let row: Option<(String, String, Option<String>)> = fetch_by_id(
        sqlx::query(
            "SELECT a.file_name, a.stored_name, a.deleted_at
             FROM task_attachments a JOIN tasks t ON t.id = a.task_id
             WHERE a.id = ?",
        )
        .bind(id),
        db.pool(),
    )
    .await?;

    let not_found = || {
        if deleted {
            AppError::not_found(format!("no deleted attachment with the id {id}"))
        } else {
            AppError::not_found(format!("no attachment with the id {id}"))
        }
    };

    let (file_name, stored_name, deleted_at) = row.ok_or_else(not_found)?;
    if deleted_at.is_some() != deleted {
        return Err(not_found());
    }

    let path = stored_path(media_dir, id, &stored_name);
    let data = match tokio::fs::read(&path).await {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::not_found(format!(
                "the file {file_name} of the attachment {id} is gone from the media folder"
            )));
        }
        Err(error) => return Err(error.into()),
    };

    Ok(AttachmentContents { file_name, data })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_the_supported_extensions() {
        let markdown = attachment_format("README.MD").unwrap();
        assert_eq!(markdown.mime, "text/markdown");
        assert_eq!(markdown.kind, AttachmentKind::Text);

        let pdf = attachment_format("paper.pdf").unwrap();
        assert_eq!(pdf.kind, AttachmentKind::Pdf);

        let zip = attachment_format("dump.zip").unwrap();
        assert_eq!(zip.kind, AttachmentKind::File);

        assert!(attachment_format("binary.exe").is_none());
        assert!(attachment_format("no extension").is_none());
    }

    #[test]
    fn keeps_the_extension_inside_the_supported_shape() {
        assert_eq!(extension_of("notes.MD"), Some("md".to_owned()));
        assert_eq!(extension_of("archive.tar.gz"), Some("gz".to_owned()));
        assert_eq!(extension_of("file.this-is-long"), None);
        assert_eq!(extension_of(".env"), Some("env".to_owned()));
    }

    #[test]
    fn splits_the_media_folder_by_the_id_prefix() {
        let path = stored_path(Path::new("/media"), "ab12cd34", "ab12cd34.png");
        assert_eq!(path, Path::new("/media/ab/ab12cd34.png"));
    }
}
