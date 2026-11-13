#![deny(unsafe_code)]

pub mod activity;
pub mod auto_backup;
pub mod backup;
pub mod config;
pub mod db;
pub mod error;
pub mod events;
pub mod media;
mod migrations;
pub mod paths;
pub mod scheduler;

pub use activity::prune_activity;
pub use auto_backup::{AutoBackup, maybe_auto_backup, newest_auto_snapshot_at};
pub use backup::{BackupFile, BackupKind, file_name as backup_file_name, list_backups, run_backup};
pub use config::{BackupConfig, Config, ConfigError};
pub use db::{Db, Tx};
pub use error::{AppError, AppErrorKind, ErrorStatus, Result};
pub use events::{ActivitySource, ChangeEvent, Entity, Events, ServerEvent, entity_of};
pub use media::{
    AttachmentContents, AttachmentFormat, AttachmentKind, attachment_format, read_attachment_file,
    read_deleted_attachment_file,
};
pub use paths::{data_fingerprint, fingerprint_path};
pub use scheduler::{
    catch_up, ms_until_next, run_scheduled, scheduled_for, start as start_scheduler,
};
