#![deny(unsafe_code)]

pub mod activity;
pub mod activity_read;
pub mod attachments;
pub mod auto_backup;
pub mod backup;
pub mod comments;
pub mod config;
pub mod db;
pub mod error;
pub mod events;
pub mod ids;
pub mod media;
mod migrations;
pub mod op_name;
pub mod paths;
pub mod projects;
pub mod restore;
pub mod scheduler;
pub mod scopes;
pub mod tags;
pub mod tasks;
#[cfg(test)]
mod test_support;

pub use activity::{ActivityEntry, prune_activity, record_activity};
pub use activity_read::{
    ActivityEntity, ActivitySearch, list_activity, search_activity, validate_activity_search,
};
pub use attachments::{
    ATTACHMENT_PURGE_KEEP_DAYS, Attachment, AttachmentCheck, DeletedAttachment,
    MAX_ATTACHMENT_SIZE, MovedAttachment, PurgedAttachment, add_attachment,
    add_attachment_from_base64, add_attachment_from_path, attachment_by_id, attachment_uri,
    copy_attachment, delete_attachment, list_all_attachments, list_attachments,
    list_deleted_attachments, move_attachment, purge_attachment, restore_attachment,
    verify_attachments,
};
pub use auto_backup::{AutoBackup, maybe_auto_backup, newest_auto_snapshot_at};
pub use backup::{BackupFile, BackupKind, file_name as backup_file_name, list_backups, run_backup};
pub use comments::{
    Comment, MAX_COMMENT_BODY_LENGTH, add_comment, delete_comment, edit_comment, get_comment,
    list_comments,
};
pub use config::{BackupConfig, Config, ConfigError};
pub use db::{Db, Tx};
pub use error::{AppError, AppErrorKind, ErrorStatus, Result};
pub use events::{ActivitySource, ChangeEvent, Entity, Events, ServerEvent, entity_of};
pub use ids::{AttachmentId, Prefix, ProjectId, ScopeId, Seq, TagName, TaskKey};
pub use media::{
    AttachmentContents, AttachmentFormat, AttachmentKind, attachment_format, read_attachment_file,
    read_deleted_attachment_file,
};
pub use op_name::OpName;
pub use paths::{data_fingerprint, fingerprint_path};
pub use projects::{
    INBOX_PROJECT_ID, INBOX_PROJECT_PREFIX, NewProject, Project, ProjectDetails, ProjectPatch,
    ProjectWithCounts, ScopeCount, create_project, ensure_inbox, get_project, list_projects,
    normalize_prefix, normalize_repo, project_details, project_id_error, project_prefix_error,
    project_with_counts, repo_error, resolve_project_ref, update_project,
};
pub use restore::{
    RestoreOutcome, SnapshotInfo, inspect_snapshot, resolve_backup, restore_backup,
    restore_snapshot_offline,
};
pub use scheduler::{
    catch_up, ms_until_next, run_scheduled, scheduled_for, start as start_scheduler,
};
pub use scopes::{
    Scope, ScopeCounts, ScopeDeleteReport, ScopeWithCounts, count_tasks_by_scope, create_scope,
    delete_scope_detailed, find_scope_by_name, get_scope, list_scopes, preview_scope_delete,
    scoped_project_ids, update_scope,
};
pub use tags::{
    TAG_NAME_MAX_LENGTH, TagCount, TagInventoryEntry, TagQuery, TagRecord, ensure_tag, get_tag,
    list_dictionary, list_tag_inventory, list_tags, normalize_tag_name, rename_tag,
    set_tag_archived, tag_name_error, validate_tags,
};
pub use tasks::{
    BlockingInfo, ClosedReason, Estimate, LinkFilter, LinkType, NewTask, OneOrList, Order,
    Priority, SearchTerm, Sort, Status, Task, TaskFilters, TaskList, TaskPatch, UpdateOutcome,
    add_blocker, add_link, close_task, close_task_detailed, count_by_status,
    count_epic_children_by_status, create_task, delete_task, get_task, get_tasks_by_ids,
    link_changes, list_revisions, list_tasks, move_task, normalize_task_id_input, now_iso,
    parse_search_query, remove_blocker, remove_link, resolve_task_id, resolve_task_id_any,
    restore_task, task_options, task_stats, update_task, update_task_detailed, warnings_for,
};
