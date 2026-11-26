#![deny(unsafe_code)]

pub mod activity;
pub mod activity_read;
pub mod attachments;
pub mod auto_backup;
pub mod backup;
pub mod comments;
pub mod config;
pub mod db;
pub mod documents;
pub mod error;
pub mod events;
pub mod fetch;
pub mod ids;
pub mod media;
mod migrations;
pub mod op_name;
pub mod pagination;
pub mod paths;
pub mod plan_items;
pub mod plans;
pub mod projects;
pub mod query;
pub mod request_log;
pub mod restore;
pub mod scheduler;
pub mod scopes;
pub mod tags;
pub mod tasks;
pub use activity::{ActivityEntry, prune_activity, record_activity};
pub use activity_read::{
    ActivityEntity, ActivityItem, ActivityPage, ActivitySearch, HistoryItem, HistoryPage,
    list_activity, search_activity, validate_activity_search,
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
pub use documents::{
    Document, DocumentKind, DocumentList, DocumentListEntry, DocumentPatch, DocumentQuery,
    DocumentSort, DocumentStatus, DocumentView, TextRevision, create_document, delete_document,
    documents_for_plan, get_document, get_document_by_key, link_document_to_plan,
    list_deleted_documents, list_document_revisions, list_documents, query_documents,
    require_document, restore_document, unlink_document_from_plan, update_document,
};
pub use error::{AppError, AppErrorKind, ErrorStatus, Result};
pub use events::{ActivitySource, ChangeEvent, Entity, Events, entity_of};
pub use ids::{
    AttachmentId, CommentId, DocumentId, DocumentKey, PlanId, PlanKey, PlanNoteId, Prefix,
    ProjectId, ScopeId, Seq, TagName, TaskKey, TaskUuid,
};
pub use media::{
    AttachmentContents, AttachmentFormat, AttachmentKind, attachment_format, read_attachment_file,
    read_deleted_attachment_file,
};
pub use op_name::OpName;
pub use pagination::{DEFAULT_LIMIT, Limit, MAX_LIMIT, Offset, validate_limit, validate_offset};
pub use paths::{data_fingerprint, fingerprint_path};
pub use plan_items::{
    PlanItem, PlanNote, add_plan_item, add_plan_note, delete_plan_note, edit_plan_note,
    list_deleted_plan_notes, list_plan_items, list_plan_note_revisions, list_plan_notes,
    remove_plan_item, reorder_plan_items, restore_plan_note,
};
pub use plans::{
    Plan, PlanCounts, PlanPatch, PlanRef, PlanStatus, PlanWithCounts, count_plan_items,
    create_plan, delete_plan, get_plan, get_plan_by_key, list_deleted_plans, list_plans,
    plan_counts, require_plan, resolve_plan_id, restore_plan, update_plan,
};
pub use projects::{
    INBOX_PROJECT_ID, INBOX_PROJECT_PREFIX, NewProject, Project, ProjectDetails, ProjectPatch,
    ProjectWithCounts, RESERVED_PROJECT_PREFIXES, ScopeCount, create_project, ensure_inbox,
    get_project, list_projects, normalize_prefix, normalize_repo, project_details,
    project_id_error, project_prefix_error, project_with_counts, repo_error, resolve_project_ref,
    update_project,
};
pub use request_log::{
    RequestLogEntry, RequestLogExport, RequestLogFilter, RequestLogItem, RequestLogPage,
    RequestStatus, export_request_log, params_hash, prune_request_log, record_request,
    redact_params, search_request_log,
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
    BlockingInfo, Change, Closed, ClosedReason, Created, Deleted, Estimate, FieldSelection,
    LinkFilter, LinkType, Linked, NewTask, OneOrList, Order, Priority, ReleasedLink, Revision,
    RevisionsPage, SearchTerm, Sort, Status, Task, TaskFilters, TaskList, TaskListEntry, TaskMany,
    TaskPatch, TaskStats, TaskView, UpdateOutcome, Updated, add_blocker, add_link, close_task,
    close_task_detailed, count_by_status, count_epic_children_by_status, create_task, delete_task,
    get_task, get_tasks_by_ids, link_changes, list_revisions, list_tasks, move_task,
    normalize_task_id_input, now_iso, parse_search_query, remove_blocker, remove_link,
    resolve_task_id, resolve_task_id_any, restore_task, task_options, task_stats, update_task,
    update_task_detailed, warnings_for,
};
