use schemars::JsonSchema;

use std::collections::BTreeMap;
use std::sync::OnceLock;

use regex::Regex;
use serde::Serialize;
use sqlx::{FromRow, Row, SqliteConnection, sqlite::SqliteRow};

use crate::common::{Status, count_by_status, now_iso};
use crate::fetch::fetch_by_id;
use crate::ids::{Prefix, ProjectId, ScopeId};
use crate::{AppError, Db, Result};

pub const INBOX_PROJECT_ID: &str = "inbox";
pub const INBOX_PROJECT_PREFIX: &str = "INB";
pub const RESERVED_PROJECT_PREFIXES: [&str; 1] = ["PL"];
pub const PROJECT_ID_MAX_LENGTH: usize = 40;
pub const REPO_MAX_LENGTH: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct Project {
    pub id: ProjectId,
    pub name: String,
    pub prefix: Prefix,
    pub repo: Option<String>,
    pub created_at: String,
    pub archived_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NewProject {
    pub id: String,
    pub name: String,
    pub prefix: String,
    pub repo: Option<Option<String>>,
}

#[derive(Debug, Clone, Default)]
pub struct ProjectPatch {
    pub name: Option<String>,
    pub archived: Option<bool>,
    pub repo: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ProjectWithCounts {
    #[serde(flatten)]
    pub project: Project,
    pub task_counts: BTreeMap<Status, i64>,
    pub epic_counts: BTreeMap<Status, i64>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ScopeCount {
    pub scope_id: ScopeId,
    pub name: String,
    pub tasks: i64,
    pub epics: i64,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ProjectDetails {
    #[serde(flatten)]
    pub project: Project,
    pub task_counts: BTreeMap<Status, i64>,
    pub epic_counts: BTreeMap<Status, i64>,
    pub scope_counts: Vec<ScopeCount>,
}

fn pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"^[a-z0-9][a-z0-9-]*$").expect("a valid project id pattern"))
}

fn prefix_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"^[A-Z0-9]{1,6}$").expect("a valid prefix pattern"))
}

fn repo_host_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"^(?i)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$")
            .expect("a valid repository host pattern")
    })
}

fn repo_segment_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"^[A-Za-z0-9._-]+$").expect("a valid repository segment"))
}

fn scheme_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"(?i)^[a-z][a-z0-9+.-]*://").expect("a valid repository scheme pattern")
    })
}

fn scp_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"^[^@/\s]+@([^:/\s]+):(.+)$").expect("a valid ssh repository pattern")
    })
}

pub fn normalize_prefix(value: &str) -> String {
    value.trim().to_uppercase()
}

pub fn project_id_error(id: &str) -> Option<String> {
    if id.is_empty() {
        return Some("Project id is required".to_string());
    }
    if id.chars().count() > PROJECT_ID_MAX_LENGTH {
        return Some(format!(
            "Project id must be {PROJECT_ID_MAX_LENGTH} characters or fewer"
        ));
    }
    if !pattern().is_match(id) {
        return Some("Project id may contain latin letters, digits and dashes".to_string());
    }
    None
}

pub fn project_prefix_error(prefix: &str) -> Option<String> {
    if prefix.is_empty() {
        return Some("Project prefix is required".to_string());
    }
    if !prefix_pattern().is_match(prefix) {
        return Some("Project prefix must be 1-6 uppercase letters or digits".to_string());
    }
    let normalized = normalize_prefix(prefix);
    if RESERVED_PROJECT_PREFIXES.contains(&normalized.as_str()) {
        return Some(format!("Project prefix {normalized} is reserved for plans"));
    }
    None
}

fn split_repo(value: &str) -> Option<(String, String)> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let rest = match scheme_pattern().find(trimmed) {
        Some(found) => trimmed[found.end()..].to_string(),
        None => match scp_pattern().captures(trimmed) {
            Some(captures) => format!("{}/{}", &captures[1], &captures[2]),
            None => trimmed.to_string(),
        },
    };

    let slash = rest.find('/')?;
    let host = rest[..slash]
        .rsplit_once('@')
        .map_or(&rest[..slash], |(_, host)| host)
        .to_lowercase();
    let mut path = rest[slash + 1..].to_string();
    trim_trailing_slashes(&mut path);
    if path.to_lowercase().ends_with(".git") {
        path.truncate(path.len() - 4);
    }
    trim_trailing_slashes(&mut path);

    if host.is_empty() || path.is_empty() {
        return None;
    }
    if path
        .split('/')
        .any(|segment| segment == "." || segment == "..")
    {
        return None;
    }
    Some((host, path))
}

fn trim_trailing_slashes(value: &mut String) {
    while value.ends_with('/') {
        value.pop();
    }
}

pub fn normalize_repo(value: &str) -> Option<String> {
    split_repo(value).map(|(host, path)| format!("{host}/{path}"))
}

pub fn repo_error(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.chars().count() > REPO_MAX_LENGTH {
        return Some(format!(
            "Repository must be {REPO_MAX_LENGTH} characters or fewer"
        ));
    }
    let Some((host, path)) = split_repo(value) else {
        return Some("Repository must look like host/owner/name".to_string());
    };
    if !repo_host_pattern().is_match(&host) {
        return Some("Repository must look like host/owner/name".to_string());
    }
    let segments: Vec<&str> = path.split('/').collect();
    if segments.len() < 2
        || !segments
            .iter()
            .all(|part| repo_segment_pattern().is_match(part))
    {
        return Some("Repository must look like host/owner/name".to_string());
    }
    None
}

impl<'r> FromRow<'r, SqliteRow> for Project {
    fn from_row(row: &'r SqliteRow) -> sqlx::Result<Self> {
        Ok(Project {
            id: ProjectId::new(row.get::<String, _>("id")),
            name: row.get("name"),
            prefix: Prefix::new(row.get::<String, _>("prefix")),
            repo: row.get("repo"),
            created_at: row.get("created_at"),
            archived_at: row.get("archived_at"),
        })
    }
}

async fn project_by_id(connection: &mut SqliteConnection, id: &str) -> Result<Option<Project>> {
    fetch_by_id(
        sqlx::query("SELECT * FROM projects WHERE id = ? COLLATE NOCASE").bind(id),
        &mut *connection,
    )
    .await
}

pub async fn get_project(db: &Db, id: &str) -> Result<Option<Project>> {
    let mut connection = db.pool().acquire().await?;
    project_by_id(&mut connection, id).await
}

pub async fn ensure_inbox(db: &Db) -> Result<Project> {
    if let Some(existing) = get_project(db, INBOX_PROJECT_ID).await? {
        if existing.archived_at.is_none() {
            return Ok(existing);
        }
        sqlx::query("UPDATE projects SET archived_at = NULL WHERE id = ?")
            .bind(INBOX_PROJECT_ID)
            .execute(db.pool())
            .await?;
        return get_project(db, INBOX_PROJECT_ID)
            .await?
            .ok_or_else(|| AppError::unexpected("the inbox disappeared after unarchiving"));
    }

    let clash: Option<(String, String)> =
        sqlx::query_as("SELECT id, name FROM projects WHERE prefix = ? COLLATE NOCASE")
            .bind(INBOX_PROJECT_PREFIX)
            .fetch_optional(db.pool())
            .await?;
    if let Some((id, name)) = clash {
        return Err(AppError::unexpected(format!(
            "cannot create Inbox: prefix {INBOX_PROJECT_PREFIX} is taken by project \"{name}\" ({id})"
        )));
    }

    sqlx::query("INSERT INTO projects (id, name, prefix, created_at) VALUES (?, 'Inbox', ?, ?)")
        .bind(INBOX_PROJECT_ID)
        .bind(INBOX_PROJECT_PREFIX)
        .bind(now_iso())
        .execute(db.pool())
        .await?;

    get_project(db, INBOX_PROJECT_ID)
        .await?
        .ok_or_else(|| AppError::unexpected("the inbox disappeared after creating it"))
}

pub async fn resolve_project_ref(db: &Db, reference: &str) -> Result<Option<Project>> {
    let mut connection = db.pool().acquire().await?;
    let trimmed = reference.trim();
    if let Some(project) = project_by_id(&mut connection, trimmed).await? {
        return Ok(Some(project));
    }
    fetch_by_id(
        sqlx::query("SELECT * FROM projects WHERE prefix = ? COLLATE NOCASE").bind(trimmed),
        &mut *connection,
    )
    .await
}

pub async fn list_projects(db: &Db, include_archived: bool) -> Result<Vec<Project>> {
    let mut connection = db.pool().acquire().await?;
    let sql = if include_archived {
        "SELECT * FROM projects ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, name"
    } else {
        "SELECT * FROM projects WHERE archived_at IS NULL ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, name"
    };
    let rows = sqlx::query_as::<_, Project>(sql)
        .bind(INBOX_PROJECT_ID)
        .fetch_all(&mut *connection)
        .await?;
    Ok(rows)
}

pub async fn create_project(db: &Db, input: NewProject) -> Result<Project> {
    let id = input.id.trim().to_string();
    let name = input.name.trim().to_string();
    let prefix = normalize_prefix(&input.prefix);
    let raw_repo = input.repo.flatten().unwrap_or_default();

    if let Some(message) = project_id_error(&id) {
        return Err(AppError::validation(message));
    }
    if name.is_empty() {
        return Err(AppError::validation("project name is required"));
    }
    if let Some(message) = project_prefix_error(&prefix) {
        return Err(AppError::validation(message));
    }
    if let Some(message) = repo_error(&raw_repo) {
        return Err(AppError::validation(message));
    }
    let repo = normalize_repo(&raw_repo);

    let mut connection = db.pool().acquire().await?;
    let clash: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM projects WHERE id = ? OR prefix = ? COLLATE NOCASE LIMIT 1",
    )
    .bind(&id)
    .bind(&prefix)
    .fetch_optional(&mut *connection)
    .await?;
    if clash.is_some() {
        return Err(AppError::conflict("project id or prefix already exists"));
    }

    sqlx::query("INSERT INTO projects (id, name, prefix, repo, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&name)
        .bind(&prefix)
        .bind(&repo)
        .bind(now_iso())
        .execute(&mut *connection)
        .await?;

    project_by_id(&mut connection, &id)
        .await?
        .ok_or_else(|| AppError::unexpected(format!("project {id} disappeared after insert")))
}

pub async fn update_project(db: &Db, id: &str, patch: ProjectPatch) -> Result<Project> {
    let mut connection = db.pool().acquire().await?;
    let Some(current) = project_by_id(&mut connection, id).await? else {
        return Err(AppError::not_found(format!("project {id} not found")));
    };

    if patch.archived == Some(true) && id == INBOX_PROJECT_ID {
        return Err(AppError::validation("inbox cannot be archived"));
    }

    let mut sets: Vec<&str> = Vec::new();
    let mut values: Vec<Option<String>> = Vec::new();

    if let Some(raw_name) = patch.name {
        let name = raw_name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::validation("project name is required"));
        }
        sets.push("name = ?");
        values.push(Some(name));
    }
    if let Some(raw_repo) = patch.repo {
        let raw = raw_repo.unwrap_or_default();
        if let Some(message) = repo_error(&raw) {
            return Err(AppError::validation(message));
        }
        sets.push("repo = ?");
        values.push(normalize_repo(&raw));
    }
    if let Some(archived) = patch.archived {
        sets.push("archived_at = ?");
        values.push(archived.then(now_iso));
    }

    if sets.is_empty() {
        return Ok(current);
    }

    let sql = format!("UPDATE projects SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(sqlx::AssertSqlSafe(sql));
    for value in values {
        query = query.bind(value);
    }
    query.bind(id).execute(&mut *connection).await?;

    project_by_id(&mut connection, id)
        .await?
        .ok_or_else(|| AppError::unexpected(format!("project {id} disappeared after update")))
}

pub async fn project_with_counts(db: &Db, project: Project) -> Result<ProjectWithCounts> {
    let task_counts = count_by_status(db.pool(), Some(project.id.as_str()), false).await?;
    let epic_counts = count_by_status(db.pool(), Some(project.id.as_str()), true).await?;
    Ok(ProjectWithCounts {
        project,
        task_counts,
        epic_counts,
    })
}

async fn scope_counts(db: &Db, project_id: &ProjectId) -> Result<Vec<ScopeCount>> {
    let rows = sqlx::query_as::<_, (i64, String, i64, i64)>(
        "SELECT s.id, s.name,
                COUNT(CASE WHEN t.is_epic = 0 THEN 1 END) AS tasks,
                COUNT(CASE WHEN t.is_epic = 1 THEN 1 END) AS epics
         FROM scopes s
         LEFT JOIN tasks t ON t.scope_id = s.id AND t.deleted_at IS NULL
         WHERE s.project_id = ? COLLATE NOCASE
         GROUP BY s.id, s.name
         ORDER BY s.name",
    )
    .bind(project_id.as_str())
    .fetch_all(db.pool())
    .await?;
    Ok(rows
        .into_iter()
        .map(|(scope_id, name, tasks, epics)| ScopeCount {
            scope_id: ScopeId::new(scope_id),
            name,
            tasks,
            epics,
        })
        .collect())
}

pub async fn project_details(db: &Db, project: Project) -> Result<ProjectDetails> {
    let task_counts = count_by_status(db.pool(), Some(project.id.as_str()), false).await?;
    let epic_counts = count_by_status(db.pool(), Some(project.id.as_str()), true).await?;
    let scope_counts = scope_counts(db, &project.id).await?;
    Ok(ProjectDetails {
        project,
        task_counts,
        epic_counts,
        scope_counts,
    })
}

#[cfg(test)]
mod tests;
