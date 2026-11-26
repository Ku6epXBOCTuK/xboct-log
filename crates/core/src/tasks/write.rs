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

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

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

pub async fn create_task(db: &Db, input: NewTask) -> Result<Created> {
    let project = project_prefix(db, input.project_id.as_str()).await?;
    let Some(prefix) = project else {
        return Err(AppError::not_found(format!(
            "project {} not found",
            input.project_id
        )));
    };

    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::validation("task title is required"));
    }
    let status = input.status.unwrap_or(Status::Backlog);
    let priority = input.priority.unwrap_or(Priority::Medium);

    let tags = normalize_tags(input.tags.as_deref());
    crate::tags::validate_tags(db, &tags).await?;
    let source_file = empty_to_null(
        input
            .source_file
            .as_ref()
            .and_then(|value| value.as_deref()),
    );
    let estimate = input.estimate.flatten();
    let assignee = empty_to_null(input.assignee.as_ref().and_then(|value| value.as_deref()));
    let due_at = normalize_due_date(input.due_at.as_ref().and_then(|value| value.as_deref()));
    if input
        .due_at
        .as_ref()
        .and_then(|value| value.as_deref())
        .is_some()
        && due_at.is_none()
    {
        return Err(AppError::validation(format!(
            "invalid due date: {}",
            input
                .due_at
                .as_ref()
                .and_then(|value| value.as_deref())
                .unwrap_or_default()
        )));
    }

    let epic_id = input.epic_id.as_ref().and_then(|value| value.as_ref());
    let resolved_epic = match epic_id {
        Some(epic) => {
            Some(resolve_epic_id(db, epic.as_str(), input.project_id.as_str(), None).await?)
        }
        None => None,
    };
    if resolved_epic.is_some() && input.is_epic == Some(true) {
        return Err(AppError::validation(
            "epics are flat: an epic cannot belong to another epic, leave epic_id unset",
        ));
    }

    let scope_id = resolve_scope_ref(
        db,
        input
            .scope_id
            .as_ref()
            .and_then(|value| value.map(ScopeId::get)),
        input.scope.as_ref().map(|value| value.as_deref()),
        input.project_id.as_str(),
    )
    .await?;

    let blocked_reason = empty_to_null(
        input
            .blocked_reason
            .as_ref()
            .and_then(|value| value.as_deref()),
    );
    if let Some(reason) = &blocked_reason
        && reason.chars().count() > BLOCKED_REASON_MAX_LENGTH
    {
        return Err(AppError::validation(format!(
            "blocked_reason is too long: {} characters, max {BLOCKED_REASON_MAX_LENGTH}",
            reason.chars().count()
        )));
    }
    if blocked_reason.is_some() && status != Status::Blocked {
        return Err(AppError::validation(
            "blocked_reason is only allowed on a blocked task",
        ));
    }

    let now = now_iso();
    let closed_at = matches!(status, Status::Done | Status::Cancelled).then(|| now.clone());
    let mut tx = db.begin().await?;
    let number = allocate_number_tx(&mut tx, input.project_id.as_str()).await?;
    let id = TaskUuid::new();
    let key = format!("{prefix}-{number}");
    sqlx::query(
        "INSERT INTO tasks (id, key, project_id, number, title, description, status, priority, is_epic, epic_id, scope_id, source_file, estimate, assignee, due_at, blocked_reason, created_at, updated_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM tasks WHERE key = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id.as_str())
    .bind(&key)
    .bind(input.project_id.as_str())
    .bind(number)
    .bind(title)
    .bind(input.description.clone().unwrap_or_default())
    .bind(status.as_str())
    .bind(priority.as_str())
    .bind(i64::from(input.is_epic == Some(true)))
    .bind(resolved_epic.as_ref().map(TaskKey::as_str))
    .bind(scope_id)
    .bind(source_file.as_deref())
    .bind(estimate.as_ref().map(|value| value.as_str()))
    .bind(assignee.as_deref())
    .bind(due_at.as_deref())
    .bind(blocked_reason.as_deref())
    .bind(&now)
    .bind(&now)
    .bind(closed_at.as_deref())
    .execute(&mut *tx)
    .await?;
    for tag in &tags {
        sqlx::query("INSERT INTO task_tags (task_id, tag) VALUES (?, ?)")
            .bind(id.as_str())
            .bind(tag.as_str())
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    let task = read_task(db, &TaskKey::from(key)).await?;
    let warnings = warnings_for(db, &task).await?;
    Ok(Created { task, warnings })
}

async fn allocate_number_tx(tx: &mut Tx, project_id: &str) -> Result<i64> {
    let (high, used): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE((SELECT last_number FROM task_number_high_water WHERE project_id = ?), 0), COALESCE((SELECT MAX(number) FROM tasks WHERE project_id = ?), 0)",
    )
    .bind(project_id)
    .bind(project_id)
    .fetch_one(&mut **tx)
    .await?;
    let next = high.max(used) + 1;
    sqlx::query(
        "INSERT INTO task_number_high_water (project_id, last_number) VALUES (?, ?) ON CONFLICT (project_id) DO UPDATE SET last_number = excluded.last_number",
    )
    .bind(project_id)
    .bind(next)
    .execute(&mut **tx)
    .await?;
    Ok(next)
}

async fn auto_close_epic(db: &Db, child: &TaskKey, now: &str) -> Result<Option<Task>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT epic.key FROM tasks child JOIN tasks epic ON epic.id = child.epic_id WHERE child.key = ?",
    )
    .bind(child.as_str())
    .fetch_optional(db.pool())
    .await?;
    let Some((epic_key,)) = row else {
        return Ok(None);
    };
    let epic = read_task(db, &TaskKey::from(epic_key)).await?;
    if epic.status == Status::Blocked || matches!(epic.status, Status::Done | Status::Cancelled) {
        return Ok(None);
    }
    let counts = count_epic_children_by_status(db, epic.id.as_str()).await?;
    let total = counts.get("total").copied().unwrap_or(0);
    let done = counts.get("done").copied().unwrap_or(0);
    let cancelled = counts.get("cancelled").copied().unwrap_or(0);
    if total == 0 || total > done + cancelled {
        return Ok(None);
    }
    sqlx::query(
        "UPDATE tasks SET status = 'done', closed_at = ?, closed_reason = 'fixed', auto_closed = 1, updated_at = ? WHERE key = ?",
    )
    .bind(now)
    .bind(now)
    .bind(epic.id.as_str())
    .execute(db.pool())
    .await?;
    Ok(Some(read_task(db, &epic.id).await?))
}

async fn reopen_auto_closed_epic(db: &Db, child: &TaskKey, now: &str) -> Result<Option<Task>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT epic.key FROM tasks child JOIN tasks epic ON epic.id = child.epic_id WHERE child.key = ? AND epic.auto_closed = 1",
    )
    .bind(child.as_str())
    .fetch_optional(db.pool())
    .await?;
    let Some((epic_key,)) = row else {
        return Ok(None);
    };
    sqlx::query(
        "UPDATE tasks SET status = 'open', closed_at = NULL, closed_reason = NULL, auto_closed = 0, updated_at = ? WHERE key = ?",
    )
    .bind(now)
    .bind(&epic_key)
    .execute(db.pool())
    .await?;
    Ok(Some(read_task(db, &TaskKey::from(epic_key)).await?))
}

fn is_restorable_status(status: Status) -> bool {
    matches!(status, Status::Backlog | Status::Open | Status::InProgress)
}

async fn list_open_blocked_by(conn: &mut SqliteConnection, key: &str) -> Result<Vec<TaskKey>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT tasks.key FROM task_links l JOIN tasks ON tasks.id = l.source_task_id WHERE l.link_type = 'blocks' AND l.target_task_id = (SELECT id FROM tasks target WHERE target.key = ?) AND tasks.deleted_at IS NULL AND tasks.status NOT IN ('done', 'cancelled') ORDER BY tasks.key",
    )
    .bind(key)
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows.into_iter().map(|(key,)| TaskKey::from(key)).collect())
}

async fn has_open_blocked_by(conn: &mut SqliteConnection, key: &str) -> Result<bool> {
    Ok(!list_open_blocked_by(conn, key).await?.is_empty())
}

#[derive(Debug, Clone)]
pub(crate) struct StatusShift {
    pub task_id: TaskKey,
    pub from: Status,
    pub to: Status,
}

pub(crate) fn shifts_to_released(shifts: Vec<StatusShift>) -> Vec<ReleasedLink> {
    shifts
        .into_iter()
        .map(|shift| ReleasedLink {
            task_id: shift.task_id,
            changes: vec![change("status", json!(shift.from), json!(shift.to))],
        })
        .collect()
}

pub(crate) async fn blocking_downstream(
    conn: &mut SqliteConnection,
    roots: &[TaskKey],
) -> Result<Vec<TaskKey>> {
    let mut seen: HashSet<TaskKey> = HashSet::new();
    let mut queue: VecDeque<TaskKey> = VecDeque::new();
    for key in roots {
        if seen.insert(key.clone()) {
            queue.push_back(key.clone());
        }
    }
    let mut ordered = Vec::new();
    while let Some(current) = queue.pop_front() {
        ordered.push(current.clone());
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT target.key FROM task_links l JOIN tasks target ON target.id = l.target_task_id WHERE l.link_type = 'blocks' AND l.source_task_id = (SELECT id FROM tasks WHERE key = ?) AND target.deleted_at IS NULL ORDER BY target.key",
        )
        .bind(current.as_str())
        .fetch_all(&mut *conn)
        .await?;
        for (key,) in rows {
            let key = TaskKey::from(key);
            if seen.insert(key.clone()) {
                queue.push_back(key);
            }
        }
    }
    Ok(ordered)
}

pub(crate) async fn sync_blocking_status(
    conn: &mut SqliteConnection,
    keys: &[TaskKey],
) -> Result<Vec<StatusShift>> {
    let mut shifts = Vec::new();
    for key in keys {
        let row: Option<(String, Option<String>)> = sqlx::query_as(
            "SELECT status, blocked_from_status FROM tasks WHERE key = ? AND deleted_at IS NULL",
        )
        .bind(key.as_str())
        .fetch_optional(&mut *conn)
        .await?;
        let Some((status, blocked_from)) = row else {
            continue;
        };
        let status = match Status::from_db(&status) {
            Some(status) => status,
            None => continue,
        };
        if matches!(status, Status::Done | Status::Cancelled) {
            continue;
        }
        let has_blocker = has_open_blocked_by(conn, key.as_str()).await?;
        if has_blocker {
            if status == Status::Blocked {
                continue;
            }
            let previous = is_restorable_status(status).then(|| status.as_str().to_string());
            sqlx::query(
                "UPDATE tasks SET status = 'blocked', blocked_from_status = ?, updated_at = ? WHERE key = ?",
            )
            .bind(previous)
            .bind(now_iso())
            .bind(key.as_str())
            .execute(&mut *conn)
            .await?;
            shifts.push(StatusShift {
                task_id: key.clone(),
                from: status,
                to: Status::Blocked,
            });
        } else if status == Status::Blocked && blocked_from.is_some() {
            let restored = blocked_from
                .as_deref()
                .and_then(Status::from_db)
                .filter(|status| is_restorable_status(*status))
                .unwrap_or(Status::Open);
            sqlx::query(
                "UPDATE tasks SET status = ?, blocked_from_status = NULL, blocked_reason = NULL, updated_at = ? WHERE key = ?",
            )
            .bind(restored.as_str())
            .bind(now_iso())
            .bind(key.as_str())
            .execute(&mut *conn)
            .await?;
            shifts.push(StatusShift {
                task_id: key.clone(),
                from: Status::Blocked,
                to: restored,
            });
        }
    }
    Ok(shifts)
}

pub async fn update_task_detailed(db: &Db, id: &str, patch: TaskPatch) -> Result<UpdateOutcome> {
    if patch.is_empty() {
        return Err(AppError::validation(
            "nothing to update: name at least one field next to task_id, e.g. {task_id: 'LOG-254', status: 'in-progress'}",
        ));
    }
    let target = super::resolve::resolve_task_id(db, id).await?;
    let current = read_task(db, &target).await?;
    if let Some(status) = patch.status
        && status != Status::Blocked
        && !matches!(status, Status::Done | Status::Cancelled)
        && !matches!(current.status, Status::Done | Status::Cancelled)
    {
        let mut conn = db.pool().acquire().await?;
        let blockers = list_open_blocked_by(&mut conn, target.as_str()).await?;
        if !blockers.is_empty() {
            let ids = blockers
                .iter()
                .map(TaskKey::as_str)
                .collect::<Vec<_>>()
                .join(", ");
            return Err(AppError::validation(format!(
                "task {target} has open blocked_by [{ids}]; finish the blockers first with tasks_close (reason fixed) or tasks_update status 'done' before setting status to '{}'",
                status.as_str()
            )));
        }
    }
    let mut changes: Vec<Change> = Vec::new();
    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Option<String>> = Vec::new();
    let now = now_iso();

    let push_text = |sets: &mut Vec<String>,
                     params: &mut Vec<Option<String>>,
                     sql: &str,
                     value: Option<String>| {
        sets.push(sql.to_string());
        params.push(value);
    };

    if let Some(title) = &patch.title {
        let title = title.trim();
        if title.is_empty() {
            return Err(AppError::validation("task title is required"));
        }
        push_text(&mut sets, &mut params, "title = ?", Some(title.to_string()));
        if title != current.title {
            changes.push(change("title", json!(current.title), json!(title)));
        }
    }
    let description_changed = match &patch.description {
        Some(description) => {
            push_text(
                &mut sets,
                &mut params,
                "description = ?",
                Some(description.clone()),
            );
            description != current.description.as_deref().unwrap_or_default()
        }
        None => false,
    };

    if let Some(status) = patch.status {
        push_text(
            &mut sets,
            &mut params,
            "status = ?",
            Some(status.as_str().to_string()),
        );
        if status != current.status {
            sets.push("auto_closed = 0".to_string());
            changes.push(change("status", json!(current.status), json!(status)));
        }
        if status == Status::Blocked {
            if current.status != Status::Blocked {
                let previous = if is_restorable_status(current.status) {
                    Some(current.status.as_str().to_string())
                } else {
                    None
                };
                push_text(&mut sets, &mut params, "blocked_from_status = ?", previous);
            }
        } else {
            sets.push("blocked_from_status = NULL".to_string());
            if let Some(reason) = &current.blocked_reason
                && patch.blocked_reason.is_none()
            {
                sets.push("blocked_reason = NULL".to_string());
                changes.push(change("blocked_reason", json!(reason), Value::Null));
            }
        }
        let closed_now = matches!(status, Status::Done | Status::Cancelled);
        let was_closed = current.closed_at.is_some();
        if closed_now && !was_closed {
            push_text(&mut sets, &mut params, "closed_at = ?", Some(now.clone()));
        } else if !closed_now && was_closed {
            push_text(&mut sets, &mut params, "closed_at = ?", None);
            push_text(&mut sets, &mut params, "closed_reason = ?", None);
        }
    }

    if let Some(reason) = &patch.blocked_reason {
        let blocked_reason = empty_to_null(reason.as_deref());
        if let Some(value) = &blocked_reason
            && value.chars().count() > BLOCKED_REASON_MAX_LENGTH
        {
            return Err(AppError::validation(format!(
                "blocked_reason is too long: {} characters, max {BLOCKED_REASON_MAX_LENGTH}",
                value.chars().count()
            )));
        }
        let next_status = patch.status.unwrap_or(current.status);
        if blocked_reason.is_some() && next_status != Status::Blocked {
            return Err(AppError::validation(
                "blocked_reason is only allowed on a blocked task",
            ));
        }
        if blocked_reason != current.blocked_reason {
            push_text(
                &mut sets,
                &mut params,
                "blocked_reason = ?",
                blocked_reason.clone(),
            );
            changes.push(change(
                "blocked_reason",
                json!(current.blocked_reason),
                json!(blocked_reason),
            ));
        }
    }

    if let Some(priority) = patch.priority {
        push_text(
            &mut sets,
            &mut params,
            "priority = ?",
            Some(priority.as_str().to_string()),
        );
        if priority != current.priority {
            changes.push(change("priority", json!(current.priority), json!(priority)));
        }
    }
    if let Some(estimate) = &patch.estimate {
        push_text(
            &mut sets,
            &mut params,
            "estimate = ?",
            estimate.map(|value| value.as_str().to_string()),
        );
        let next = estimate.map(|value| value.as_str());
        let was = current.estimate.as_ref().map(|value| value.as_str());
        if next != was {
            changes.push(change("estimate", json!(was), json!(next)));
        }
    }
    if let Some(assignee) = &patch.assignee {
        let assignee = empty_to_null(assignee.as_deref());
        push_text(&mut sets, &mut params, "assignee = ?", assignee.clone());
        if assignee != current.assignee {
            changes.push(change("assignee", json!(current.assignee), json!(assignee)));
        }
    }
    if let Some(due) = &patch.due_at {
        let raw = due.as_deref().unwrap_or_default();
        let due_at = normalize_due_date(Some(raw));
        if due_at.is_none() && !raw.trim().is_empty() {
            return Err(AppError::validation(format!("invalid due date: {raw}")));
        }
        push_text(&mut sets, &mut params, "due_at = ?", due_at.clone());
        if due_at != current.due_at {
            changes.push(change("due_at", json!(current.due_at), json!(due_at)));
        }
    }
    if let Some(is_epic) = patch.is_epic {
        if current.is_epic && !is_epic {
            let (count,): (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM tasks WHERE epic_id = (SELECT id FROM tasks epic WHERE epic.key = ?) AND deleted_at IS NULL",
            )
            .bind(target.as_str())
            .fetch_one(db.pool())
            .await?;
            if count > 0 {
                return Err(AppError::validation(format!(
                    "cannot demote an epic with {count} subtask(s): detach or move them first"
                )));
            }
        }
        push_text(
            &mut sets,
            &mut params,
            "is_epic = ?",
            Some(i64::from(is_epic).to_string()),
        );
        if is_epic != current.is_epic {
            changes.push(change("is_epic", json!(current.is_epic), json!(is_epic)));
        }
    }

    let mut next_tags: Option<Vec<TagName>> = None;
    if let Some(tags) = &patch.tags {
        let tags = normalize_tags(Some(tags));
        crate::tags::validate_tags(db, &tags).await?;
        let unchanged = tags.len() == current.tags.len()
            && tags
                .iter()
                .all(|tag| current.tags.iter().any(|known| known == tag));
        if !unchanged {
            let mut sorted = tags.clone();
            sorted.sort();
            changes.push(change("tags", json!(current.tags), json!(sorted)));
        }
        next_tags = Some(tags);
    }

    if let Some(source_file) = &patch.source_file {
        push_text(
            &mut sets,
            &mut params,
            "source_file = ?",
            empty_to_null(source_file.as_deref()),
        );
    }

    if let Some(epic_id) = &patch.epic_id {
        let resolved = match epic_id {
            Some(epic) => Some(
                resolve_epic_id(
                    db,
                    epic.as_str(),
                    current.project_id.as_str(),
                    Some(target.as_str()),
                )
                .await?,
            ),
            None => None,
        };
        push_text(
            &mut sets,
            &mut params,
            "epic_id = (SELECT id FROM tasks WHERE key = ?)",
            resolved.as_ref().map(|key| key.as_str().to_string()),
        );
        let was = current.epic_id.as_ref().map(TaskKey::as_str);
        let next = resolved.as_ref().map(TaskKey::as_str);
        if was != next {
            changes.push(change("epic_id", json!(was), json!(next)));
        }
    }

    let next_is_epic = patch.is_epic.unwrap_or(current.is_epic);
    let next_epic_id = patch
        .epic_id
        .as_ref()
        .map(|value| value.as_ref())
        .unwrap_or(current.epic_id.as_ref());
    if next_is_epic && next_epic_id.is_some() {
        return Err(AppError::validation(
            "epics are flat: an epic cannot belong to another epic, leave epic_id unset",
        ));
    }

    if patch.scope_id.is_some() || patch.scope.is_some() {
        let scope_id = resolve_scope_ref(
            db,
            patch
                .scope_id
                .as_ref()
                .and_then(|value| value.map(ScopeId::get)),
            patch.scope.as_ref().map(|value| value.as_deref()),
            current.project_id.as_str(),
        )
        .await?;
        let scope_id = scope_id.map(ScopeId::from);
        push_text(
            &mut sets,
            &mut params,
            "scope_id = ?",
            scope_id.map(|value| value.get().to_string()),
        );
        if scope_id != current.scope_id {
            changes.push(change("scope_id", json!(current.scope_id), json!(scope_id)));
        }
    }

    push_text(&mut sets, &mut params, "updated_at = ?", Some(now.clone()));

    let closed_now = patch
        .status
        .is_some_and(|status| matches!(status, Status::Done | Status::Cancelled))
        && !matches!(current.status, Status::Done | Status::Cancelled);
    let reopened_now = patch
        .status
        .is_some_and(|status| !matches!(status, Status::Done | Status::Cancelled))
        && matches!(current.status, Status::Done | Status::Cancelled);

    if description_changed {
        let mut connection = db.pool().acquire().await?;
        record_revision(
            &mut connection,
            target.as_str(),
            "description",
            None,
            current.description.as_deref().unwrap_or_default(),
            chrono::DateTime::parse_from_rfc3339(&now)
                .map(|value| value.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now()),
        )
        .await?;
    }
    let mut tx = db.begin().await?;
    let sql = format!("UPDATE tasks SET {} WHERE key = ?", sets.join(", "));
    let mut update = sqlx::query(sqlx::AssertSqlSafe(sql));
    for param in &params {
        update = update.bind(param.clone());
    }
    update.bind(target.as_str()).execute(&mut *tx).await?;

    if let Some(tags) = &next_tags {
        sqlx::query("DELETE FROM task_tags WHERE task_id = (SELECT id FROM tasks WHERE key = ?)")
            .bind(target.as_str())
            .execute(&mut *tx)
            .await?;
        for tag in tags {
            sqlx::query(
                "INSERT INTO task_tags (task_id, tag) SELECT id, ? FROM tasks WHERE key = ?",
            )
            .bind(tag.as_str())
            .bind(target.as_str())
            .execute(&mut *tx)
            .await?;
        }
    }
    let affected = blocking_downstream(&mut tx, std::slice::from_ref(&target)).await?;
    let reblocked = reopened_now
        && matches!(current.status, Status::Done | Status::Cancelled)
        && patch.status.is_some_and(is_restorable_status);
    let checked = if reblocked {
        affected.as_slice()
    } else {
        &affected[1..]
    };
    let mut shifts = sync_blocking_status(&mut tx, checked).await?;
    tx.commit().await?;

    let mut changes = changes;
    if let Some(index) = shifts.iter().position(|shift| shift.task_id == target) {
        let shift = shifts.remove(index);
        if let Some(change) = changes.iter_mut().find(|change| change.field == "status") {
            change.to = json!(shift.to);
        }
    }

    let closed_epic = if closed_now {
        auto_close_epic(db, &target, &now).await?
    } else {
        None
    };
    let reopened_epic = if reopened_now {
        reopen_auto_closed_epic(db, &target, &now).await?
    } else {
        None
    };
    Ok(UpdateOutcome {
        task: read_task(db, &target).await?,
        changes,
        released: shifts_to_released(shifts),
        closed_epic,
        reopened_epic,
    })
}

pub async fn update_task(db: &Db, id: &str, patch: TaskPatch) -> Result<Updated> {
    let outcome = update_task_detailed(db, id, patch).await?;
    let warnings = warnings_for(db, &outcome.task).await?;
    Ok(Updated {
        task: outcome.task,
        changes: outcome.changes,
        released: outcome.released,
        warnings,
        closed_epic: outcome.closed_epic,
        reopened_epic: outcome.reopened_epic,
    })
}

pub async fn close_task_detailed(
    db: &Db,
    id: &str,
    reason: super::model::ClosedReason,
) -> Result<UpdateOutcome> {
    let target = super::resolve::resolve_task_id(db, id).await?;
    let current = read_task(db, &target).await?;
    let status = reason.status();
    let changes = vec![
        change("status", json!(current.status), json!(status)),
        change("closed_reason", json!(current.closed_reason), json!(reason)),
    ];
    let now = now_iso();
    let mut tx = db.begin().await?;
    sqlx::query(
        "UPDATE tasks SET status = ?, closed_at = ?, closed_reason = ?, auto_closed = 0, updated_at = ? WHERE key = ?",
    )
    .bind(status.as_str())
    .bind(&now)
    .bind(reason.as_str())
    .bind(&now)
    .bind(target.as_str())
    .execute(&mut *tx)
    .await?;
    let affected = blocking_downstream(&mut tx, std::slice::from_ref(&target)).await?;
    let shifts = sync_blocking_status(&mut tx, &affected[1..]).await?;
    tx.commit().await?;

    let released = shifts_to_released(shifts);
    let closed_epic = auto_close_epic(db, &target, &now).await?;
    Ok(UpdateOutcome {
        task: read_task(db, &target).await?,
        changes,
        released,
        closed_epic,
        reopened_epic: None,
    })
}

pub async fn close_task(db: &Db, id: &str, reason: super::model::ClosedReason) -> Result<Closed> {
    let outcome = close_task_detailed(db, id, reason).await?;
    let warnings = warnings_for(db, &outcome.task).await?;
    Ok(Closed {
        task: outcome.task,
        changes: outcome.changes,
        released: outcome.released,
        warnings,
        closed_epic: outcome.closed_epic,
    })
}

async fn list_blocked_by(db: &Db, key: &str) -> Result<Vec<TaskKey>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT tasks.key FROM task_links l JOIN tasks ON tasks.id = l.source_task_id WHERE l.link_type = 'blocks' AND l.target_task_id = (SELECT id FROM tasks target WHERE target.key = ?) AND tasks.deleted_at IS NULL",
    )
    .bind(key)
    .fetch_all(db.pool())
    .await?;
    let mut keys: Vec<TaskKey> = rows.into_iter().map(|(key,)| TaskKey::from(key)).collect();
    keys.sort();
    Ok(keys)
}

pub async fn delete_task(db: &Db, id: &str) -> Result<Deleted> {
    let target = super::resolve::resolve_task_id(db, id).await?;
    let info = super::sql::blocking_info_for(db, &[target.to_string()])
        .await?
        .remove(target.as_str())
        .unwrap_or_default();
    let blocker_ids = info.blocked_by;
    let blocked_ids = info.blocks;
    let mut blocked_before: Vec<(TaskKey, Vec<TaskKey>)> = Vec::new();
    for blocked in &blocked_ids {
        blocked_before.push((
            blocked.clone(),
            list_blocked_by(db, blocked.as_str()).await?,
        ));
    }
    let children: Vec<(String,)> = sqlx::query_as(
        "SELECT key FROM tasks WHERE epic_id = (SELECT id FROM tasks epic WHERE epic.key = ?) AND deleted_at IS NULL",
    )
    .bind(target.as_str())
    .fetch_all(db.pool())
    .await?;

    let now = now_iso();
    let mut tx = db.begin().await?;
    let affected = blocking_downstream(&mut tx, std::slice::from_ref(&target)).await?;
    sqlx::query(
        "UPDATE tasks SET epic_id = NULL, updated_at = ? WHERE epic_id = (SELECT id FROM tasks epic WHERE epic.key = ?)",
    )
    .bind(&now)
    .bind(target.as_str())
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE key = ?")
        .bind(&now)
        .bind(&now)
        .bind(target.as_str())
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "DELETE FROM task_links WHERE source_task_id = (SELECT id FROM tasks WHERE key = ?) OR target_task_id = (SELECT id FROM tasks WHERE key = ?)",
    )
    .bind(target.as_str())
    .bind(target.as_str())
    .execute(&mut *tx)
    .await?;
    let shifts = sync_blocking_status(&mut tx, &affected[1..]).await?;
    tx.commit().await?;

    let mut released: Vec<ReleasedLink> = shifts_to_released(shifts);
    for (blocked, before) in &blocked_before {
        let after: Vec<TaskKey> = before
            .iter()
            .filter(|blocker| blocker.as_str() != target.as_str())
            .cloned()
            .collect();
        let changes = vec![change("blocked_by", json!(before), json!(after))];
        match released.iter_mut().find(|link| link.task_id == *blocked) {
            Some(link) => {
                link.changes.splice(0..0, changes);
            }
            None => released.push(ReleasedLink {
                task_id: blocked.clone(),
                changes,
            }),
        }
    }
    for (child,) in children {
        released.push(ReleasedLink {
            task_id: TaskKey::from(child),
            changes: vec![change("epic_id", json!(target), Value::Null)],
        });
    }
    Ok(Deleted {
        id: target,
        deleted_at: now.clone(),
        changes: vec![
            change("deleted_at", Value::Null, json!(now)),
            change("blocked_by", json!(blocker_ids), json!([])),
        ],
        released,
    })
}

pub async fn restore_task(db: &Db, id: &str) -> Result<Task> {
    let target = super::resolve::resolve_task_id_any(db, id).await?;
    let task = task_by_key(db, target.as_str())
        .await?
        .ok_or_else(|| AppError::not_found(format!("task {target} not found")))?;
    if task.deleted_at.is_none() {
        return Err(AppError::conflict(format!("task {target} is not deleted")));
    }
    let now = now_iso();
    sqlx::query("UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE key = ?")
        .bind(&now)
        .bind(target.as_str())
        .execute(db.pool())
        .await?;
    read_task(db, &target).await
}

async fn collect_subtree(db: &Db, root: &str) -> Result<Vec<String>> {
    let mut keys = vec![root.to_string()];
    let mut index = 0;
    while index < keys.len() {
        let current = keys[index].clone();
        index += 1;
        let children: Vec<(String,)> = sqlx::query_as(
            "SELECT tasks.key AS key FROM tasks WHERE tasks.epic_id = (SELECT id FROM tasks epic WHERE epic.key = ?) ORDER BY tasks.number",
        )
        .bind(&current)
        .fetch_all(db.pool())
        .await?;
        for (key,) in children {
            keys.push(key);
        }
    }
    Ok(keys)
}

pub async fn move_task(db: &Db, id: &str, project_id: &str) -> Result<Task> {
    let source_key = super::resolve::resolve_task_id(db, id).await?;
    let task = read_task(db, &source_key).await?;
    let target: Option<(String, String)> =
        sqlx::query_as("SELECT id, prefix FROM projects WHERE id = ?")
            .bind(project_id)
            .fetch_optional(db.pool())
            .await?;
    let Some((target_id, target_prefix)) = target else {
        return Err(AppError::not_found(format!(
            "project {project_id} not found"
        )));
    };
    if task.project_id.as_str() == target_id {
        return Ok(task);
    }

    let now = now_iso();
    let subtree = collect_subtree(db, source_key.as_str()).await?;
    let mut tx = db.begin().await?;
    let mut moved_key = String::new();
    for key in subtree {
        sqlx::query(
            "INSERT INTO task_move_history (old_key, task_id, created_at)
             SELECT ?, id, ? FROM tasks WHERE key = ?
             ON CONFLICT (old_key) DO NOTHING",
        )
        .bind(&key)
        .bind(&now)
        .bind(&key)
        .execute(&mut *tx)
        .await?;
        let number = allocate_number_tx(&mut tx, &target_id).await?;
        let new_key = format!("{target_prefix}-{number}");
        if key == source_key.as_str() {
            sqlx::query(
                "UPDATE tasks SET project_id = ?, number = ?, key = ?, epic_id = NULL, scope_id = NULL, updated_at = ? WHERE key = ?",
            )
            .bind(&target_id)
            .bind(number)
            .bind(&new_key)
            .bind(&now)
            .bind(&key)
            .execute(&mut *tx)
            .await?;
            moved_key = new_key;
        } else {
            sqlx::query(
                "UPDATE tasks SET project_id = ?, number = ?, key = ?, scope_id = NULL, updated_at = ? WHERE key = ?",
            )
            .bind(&target_id)
            .bind(number)
            .bind(&new_key)
            .bind(&now)
            .bind(&key)
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await?;
    read_task(db, &TaskKey::from(moved_key)).await
}
