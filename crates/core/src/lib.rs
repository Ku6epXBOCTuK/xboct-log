#![deny(unsafe_code)]

pub mod backup;
pub mod config;
pub mod db;
pub mod error;
pub mod media;
mod migrations;
pub mod paths;

pub use backup::{BackupKind, file_name as backup_file_name, run_backup};
pub use config::{BackupConfig, Config, ConfigError};
pub use db::{Db, Tx};
pub use error::{AppError, AppErrorKind, ErrorStatus, Result};
pub use media::{
    AttachmentContents, AttachmentFormat, AttachmentKind, attachment_format, read_attachment_file,
    read_deleted_attachment_file,
};
pub use paths::{data_fingerprint, fingerprint_path};
