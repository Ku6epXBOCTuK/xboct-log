#![deny(unsafe_code)]

pub mod activity;
pub mod auto_backup;
pub mod backup;
pub mod config;
pub mod db;
pub mod error;
pub mod events;
pub mod ids;
pub mod media;
mod migrations;
pub mod paths;
pub mod scheduler;
pub mod tasks;
#[cfg(test)]
mod test_support;

pub use activity::prune_activity;
pub use auto_backup::{AutoBackup, maybe_auto_backup, newest_auto_snapshot_at};
pub use backup::{BackupFile, BackupKind, file_name as backup_file_name, list_backups, run_backup};
pub use config::{BackupConfig, Config, ConfigError};
pub use db::{Db, Tx};
pub use error::{AppError, AppErrorKind, ErrorStatus, Result};
pub use events::{ActivitySource, ChangeEvent, Entity, Events, ServerEvent, entity_of};
pub use ids::{Prefix, ProjectId, ScopeId, Seq, TagName, TaskKey};
pub use media::{
    AttachmentContents, AttachmentFormat, AttachmentKind, attachment_format, read_attachment_file,
    read_deleted_attachment_file,
};
pub use paths::{data_fingerprint, fingerprint_path};
pub use scheduler::{
    catch_up, ms_until_next, run_scheduled, scheduled_for, start as start_scheduler,
};
pub use tasks::{
    BlockingInfo, ClosedReason, Estimate, LinkType, NewTask, NullableList, OneOrList, Order,
    Priority, Sort, Status, Task, TaskFilters, TaskList, TaskPatch, UpdateOutcome, add_blocker,
    add_link, close_task, close_task_detailed, count_epic_children_by_status, create_task,
    delete_task, get_task, link_changes, list_tasks, move_task, normalize_task_id_input,
    remove_blocker, remove_link, resolve_task_id, resolve_task_id_any, restore_task, update_task,
    update_task_detailed, warnings_for,
};
