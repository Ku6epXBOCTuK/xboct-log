use std::collections::{HashSet, VecDeque};

use schemars::JsonSchema;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::SqliteConnection;

use crate::ids::{ProjectId, ScopeId, TagName, TaskKey, TaskUuid};
use crate::{AppError, Db, Result, Tx};

use super::model::{
    Change, Closed, Created, Deleted, Estimate, Priority, ReleasedLink, Status, Task, Updated,
};
use super::resolve::{resolve_epic_id, resolve_scope_ref};
use super::sql::{count_epic_children_by_status, task_by_key};

pub const BLOCKED_REASON_MAX_LENGTH: usize = 200;
const REVISION_MERGE_MS: i64 = 30 * 60_000;

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct NewTask {
    pub project_id: ProjectId,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub status: Option<Status>,
    #[serde(default)]
    pub priority: Option<Priority>,
    #[serde(default)]
    pub is_epic: Option<bool>,
    #[schemars(
        description = "Epic id in the full 'PREFIX-NUMBER' form (e.g. 'LOG-5'); a bare number such as '5' is unique only inside a project. The epic belongs to the same project as the task. Epics are flat: only a non-epic task carries epic_id, and an epic itself never has one."
    )]
    #[serde(default)]
    pub epic_id: Option<Option<TaskKey>>,
    #[schemars(
        description = "Scope id; it must belong to the same project as the task. Prefer scope (the name) when you know it; scopes_list {project_id} lists the ids."
    )]
    #[serde(default)]
    pub scope_id: Option<Option<ScopeId>>,
    #[schemars(
        description = "Scope name inside the task's project, e.g. 'ui'. Prefer it over scope_id when you know the name: it is matched case-insensitively, and an unknown name fails with the list of the project's scopes instead of creating one. Passing both scope and scope_id is allowed only when they name the same scope."
    )]
    #[serde(default)]
    pub scope: Option<Option<String>>,
    #[schemars(
        description = "File or document the task came from; provenance only, never verified, several tasks may share it."
    )]
    #[serde(default)]
    pub source_file: Option<Option<String>>,
    #[schemars(
        description = "Tags of the task, optional. Closed dictionary: the Active tags list in the tool description and tags_dictionary show every assignable name; create a genuinely new one with tags_create {name} first, then retry. Names are lowercased."
    )]
    #[serde(default)]
    pub tags: Option<Vec<TagName>>,
    #[schemars(
        description = "Size of the task. Allowed values are in the tool schema. null leaves the task without an estimate."
    )]
    #[serde(default)]
    pub estimate: Option<Option<Estimate>>,
    #[schemars(
        description = "Person responsible for the task, a free-form name. null leaves the task unassigned."
    )]
    #[serde(default)]
    pub assignee: Option<Option<String>>,
    #[schemars(
        description = "Due date of the task as YYYY-MM-DD; a full ISO timestamp is accepted and cut to the day. null leaves the task without a due date."
    )]
    #[serde(default)]
    pub due_at: Option<Option<String>>,
    #[schemars(
        description = "Why the task is blocked, one line of free text. Use it when the blocker is outside the tracker (waiting for a release, an answer, an access). Only allowed on a task with status 'blocked'; null clears it."
    )]
    #[serde(default)]
    pub blocked_reason: Option<Option<String>>,
}

#[derive(Debug, Clone, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TaskPatch {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub status: Option<Status>,
    #[serde(default)]
    pub priority: Option<Priority>,
    #[serde(default)]
    pub is_epic: Option<bool>,
    #[schemars(
        description = "Epic id in the full 'PREFIX-NUMBER' form (e.g. 'LOG-5'); a bare number such as '5' is unique only inside a project. The epic belongs to the same project as the task. Epics are flat: only a non-epic task carries epic_id, and an epic itself never has one."
    )]
    #[serde(default)]
    pub epic_id: Option<Option<TaskKey>>,
    #[schemars(
        description = "Scope id; it must belong to the same project as the task. Prefer scope (the name) when you know it. null clears the scope."
    )]
    #[serde(default)]
    pub scope_id: Option<Option<ScopeId>>,
    #[schemars(
        description = "Scope name inside the task's project, e.g. 'ui'; matched case-insensitively. null clears the scope. Prefer it over scope_id when you know the name; passing both is allowed only when they name the same scope."
    )]
    #[serde(default)]
    pub scope: Option<Option<String>>,
    #[schemars(
        description = "File or document the task came from; provenance only, never verified, several tasks may share it."
    )]
    #[serde(default)]
    pub source_file: Option<Option<String>>,
    #[schemars(
        description = "Tags of the task, optional; an empty array clears them. Closed dictionary: the Active tags list in the tool description and tags_dictionary show every assignable name; create a genuinely new one with tags_create {name} first, then retry. Names are lowercased."
    )]
    #[serde(default)]
    pub tags: Option<Vec<TagName>>,
    #[schemars(
        description = "Size of the task. Allowed values are in the tool schema. null clears the estimate."
    )]
    #[serde(default)]
    pub estimate: Option<Option<Estimate>>,
    #[schemars(
        description = "Person responsible for the task, a free-form name. null clears the assignee."
    )]
    #[serde(default)]
    pub assignee: Option<Option<String>>,
    #[schemars(
        description = "Due date of the task as YYYY-MM-DD; a full ISO timestamp is accepted and cut to the day. null clears the due date."
    )]
    #[serde(default)]
    pub due_at: Option<Option<String>>,
    #[schemars(
        description = "Why the task is blocked, one line of free text. Use it when the blocker is outside the tracker (waiting for a release, an answer, an access). Only allowed on a task with status 'blocked'; null clears it."
    )]
    #[serde(default)]
    pub blocked_reason: Option<Option<String>>,
}

impl TaskPatch {
    fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.description.is_none()
            && self.status.is_none()
            && self.priority.is_none()
            && self.is_epic.is_none()
            && self.epic_id.is_none()
            && self.scope_id.is_none()
            && self.scope.is_none()
            && self.source_file.is_none()
            && self.tags.is_none()
            && self.estimate.is_none()
            && self.assignee.is_none()
            && self.due_at.is_none()
            && self.blocked_reason.is_none()
    }
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct UpdateOutcome {
    pub task: Task,
    pub changes: Vec<Change>,
    pub released: Vec<ReleasedLink>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_epic: Option<Task>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reopened_epic: Option<Task>,
}

pub fn empty_to_null(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

pub fn normalize_tags(tags: Option<&[TagName]>) -> Vec<TagName> {
    let mut normalized: Vec<TagName> = Vec::new();
    for tag in tags.unwrap_or_default() {
        let tag = TagName::normalized(tag.as_str());
        if !normalized.iter().any(|known| known == &tag) {
            normalized.push(tag);
        }
    }
    normalized
}

pub fn normalize_due_date(value: Option<&str>) -> Option<String> {
    let trimmed = value.unwrap_or_default().trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(trimmed, "%Y-%m-%d") {
        return Some(date.format("%Y-%m-%d").to_string());
    }
    let parsed = chrono::DateTime::parse_from_rfc3339(trimmed).ok()?;
    Some(
        parsed
            .with_timezone(&chrono::Utc)
            .date_naive()
            .format("%Y-%m-%d")
            .to_string(),
    )
}

pub use crate::common::now_iso;

fn change(field: &str, from: Value, to: Value) -> Change {
    Change {
        field: field.to_string(),
        from,
        to,
    }
}

async fn project_prefix(db: &Db, project_id: &str) -> Result<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as("SELECT prefix FROM projects WHERE id = ?")
        .bind(project_id)
        .fetch_optional(db.pool())
        .await?;
    Ok(row.map(|(prefix,)| prefix))
}

pub async fn record_revision(
    connection: &mut sqlx::SqliteConnection,
    task_id: &str,
    field: &str,
    ref_id: Option<&str>,
    body: &str,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<()> {
    let latest: Option<(String,)> = sqlx::query_as(
        "SELECT created_at FROM task_revisions WHERE task_id = (SELECT id FROM tasks WHERE key = ?) AND field = ? AND ref_id IS ? ORDER BY id DESC LIMIT 1",
    )
    .bind(task_id)
    .bind(field)
    .bind(ref_id)
    .fetch_optional(&mut *connection)
    .await?;
    if let Some((created_at,)) = latest
        && let Ok(created) = chrono::DateTime::parse_from_rfc3339(&created_at)
    {
        let elapsed = now.timestamp_millis() - created.timestamp_millis();
        if (0..REVISION_MERGE_MS).contains(&elapsed) {
            return Ok(());
        }
    }
    sqlx::query(
        "INSERT INTO task_revisions (task_id, field, ref_id, body, created_at) VALUES ((SELECT id FROM tasks WHERE key = ?), ?, ?, ?, ?)",
    )
    .bind(task_id)
    .bind(field)
    .bind(ref_id)
    .bind(body)
    .bind(now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
    .execute(&mut *connection)
    .await?;
    Ok(())
}

pub async fn warnings_for(db: &Db, task: &Task) -> Result<Vec<String>> {
    let mut warnings = Vec::new();
    if task.status == Status::Blocked && task.blocked_by.is_empty() && task.blocked_reason.is_none()
    {
        warnings.push(
            "task is blocked with no blocker task and no blocked_reason: say what or who it waits for, or add a blocker"
                .to_string(),
        );
    }
    if task.is_epic && matches!(task.status, Status::Done | Status::Cancelled) {
        let counts = count_epic_children_by_status(db, task.id.as_str()).await?;
        let total = counts.get("total").copied().unwrap_or(0);
        let done = counts.get("done").copied().unwrap_or(0);
        let cancelled = counts.get("cancelled").copied().unwrap_or(0);
        let open = total - done - cancelled;
        if open > 0 {
            warnings.push(format!(
                "epic is {} while {open} of {total} subtasks are still open: close them too or reopen the epic",
                task.status.as_str()
            ));
        }
    }
    Ok(warnings)
}

async fn read_task(db: &Db, key: &TaskKey) -> Result<Task> {
    task_by_key(db, key.as_str())
        .await?
        .ok_or_else(|| AppError::unexpected(format!("task {key} disappeared while writing")))
}

mod create;
mod lifecycle;
mod status;
mod update;
pub(crate) use create::allocate_number_tx;
pub use create::create_task;
pub use lifecycle::{
    close_task, close_task_detailed, delete_task, move_task, restore_task, update_task,
};
pub(crate) use status::*;
pub use update::update_task_detailed;
