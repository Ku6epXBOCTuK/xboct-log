use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{QueryBuilder, Sqlite};

use crate::{ActivitySource, AppError, Db, OpName, ProjectId, Result};

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ActivityEntity {
    Task,
    Project,
    Scope,
    Tag,
}

impl ActivityEntity {
    pub fn as_str(self) -> &'static str {
        match self {
            ActivityEntity::Task => "task",
            ActivityEntity::Project => "project",
            ActivityEntity::Scope => "scope",
            ActivityEntity::Tag => "tag",
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActivitySearch {
    #[serde(default)]
    pub source: Option<ActivitySource>,
    #[serde(default)]
    pub op: Option<OpName>,
    #[serde(default)]
    pub entity: Option<ActivityEntity>,
    #[serde(default)]
    pub project_id: Option<ProjectId>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
}

async fn has_table(db: &Db) -> Result<bool> {
    let exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'activity'",
    )
    .fetch_optional(db.pool())
    .await?;
    Ok(exists.is_some())
}

fn parse_fields(raw: &str) -> Vec<Value> {
    match serde_json::from_str::<Value>(raw) {
        Ok(Value::Array(items)) => items
            .into_iter()
            .filter(Value::is_string)
            .collect::<Vec<Value>>(),
        _ => Vec::new(),
    }
}

fn parse_changes(raw: Option<&str>) -> Vec<Value> {
    let Some(raw) = raw else {
        return Vec::new();
    };
    if raw.trim().is_empty() {
        return Vec::new();
    }
    match serde_json::from_str::<Value>(raw) {
        Ok(Value::Array(items)) => items
            .into_iter()
            .filter(|item| item.get("field").and_then(Value::as_str).is_some())
            .collect(),
        _ => Vec::new(),
    }
}

fn clamp_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(50).clamp(1, 200)
}

fn push_search(query: &mut QueryBuilder<Sqlite>, search: &ActivitySearch) {
    if let Some(source) = &search.source {
        query.push(" AND source = ").push_bind(source.as_str());
    }
    if let Some(op) = &search.op {
        query.push(" AND op = ").push_bind(op.as_str());
    }
    if let Some(entity) = &search.entity {
        query.push(" AND entity = ").push_bind(entity.as_str());
    }
    if let Some(project_id) = &search.project_id {
        query
            .push(
                " AND ((entity = 'project' AND entity_id = ",
            )
            .push_bind(project_id.as_str())
            .push(
                ") OR (entity = 'task' AND (entity_id IN (SELECT key FROM tasks WHERE project_id = ",
            )
            .push_bind(project_id.as_str())
            .push(
                ") OR entity_task_id IN (SELECT id FROM tasks WHERE project_id = ",
            )
            .push_bind(project_id.as_str())
            .push(
                "))) OR (entity = 'scope' AND entity_id IN (SELECT CAST(id AS TEXT) FROM scopes WHERE project_id = ",
            )
            .push_bind(project_id.as_str())
            .push(")))");
    }
    if let Some(from) = &search.from {
        query.push(" AND created_at >= ").push_bind(from.as_str());
    }
    if let Some(to) = &search.to {
        query.push(" AND created_at <= ").push_bind(to.as_str());
    }
}

fn push_history(query: &mut QueryBuilder<Sqlite>, entity: &str, entity_id: &str) {
    query.push(" AND entity = ").push_bind(entity);
    if entity == "task" {
        query
            .push(" AND (entity_id = ")
            .push_bind(entity_id)
            .push(" OR entity_task_id = (SELECT id FROM tasks WHERE key = ")
            .push_bind(entity_id)
            .push("))");
    } else {
        query.push(" AND entity_id = ").push_bind(entity_id);
    }
}

type SearchRow = (
    String,
    String,
    Option<String>,
    String,
    String,
    String,
    String,
    Option<String>,
);

type HistoryRow = (
    String,
    String,
    Option<String>,
    String,
    String,
    Option<String>,
);

pub async fn search_activity(db: &Db, search: &ActivitySearch) -> Result<Value> {
    if !has_table(db).await? {
        return Ok(json!({ "items": [], "total": 0, "ops": [] }));
    }
    let limit = clamp_limit(search.limit);
    let offset = search.offset.unwrap_or(0).max(0);

    let mut count = QueryBuilder::<Sqlite>::new("SELECT COUNT(*) FROM activity WHERE 1 = 1");
    push_search(&mut count, search);
    let total: i64 = count.build_query_scalar().fetch_one(db.pool()).await?;

    let mut query = QueryBuilder::<Sqlite>::new(
        "SELECT created_at, source, client, op, entity, entity_id, fields, changes FROM activity WHERE 1 = 1",
    );
    push_search(&mut query, search);
    query
        .push(" ORDER BY id DESC LIMIT ")
        .push_bind(limit)
        .push(" OFFSET ")
        .push_bind(offset);
    let rows: Vec<SearchRow> = query.build_query_as().fetch_all(db.pool()).await?;
    let items: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            json!({
                "ts": row.0,
                "source": row.1,
                "client": row.2,
                "op": row.3,
                "entity": row.4,
                "entity_id": row.5,
                "fields": parse_fields(&row.6),
                "changes": parse_changes(row.7.as_deref()),
            })
        })
        .collect();

    let mut ops_query =
        QueryBuilder::<Sqlite>::new("SELECT DISTINCT op FROM activity WHERE op IN (");
    {
        let mut names = ops_query.separated(", ");
        for name in OpName::ALL {
            names.push_bind(name.as_str());
        }
        names.push_unseparated(") ORDER BY op");
    }
    let ops: Vec<String> = ops_query.build_query_scalar().fetch_all(db.pool()).await?;
    Ok(json!({ "items": items, "total": total, "ops": ops }))
}

pub async fn list_activity(
    db: &Db,
    entity: &str,
    entity_id: &str,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Value> {
    if !has_table(db).await? {
        return Ok(json!({ "items": [], "total": 0 }));
    }
    let mut count = QueryBuilder::<Sqlite>::new("SELECT COUNT(*) FROM activity WHERE 1 = 1");
    push_history(&mut count, entity, entity_id);
    let total: i64 = count.build_query_scalar().fetch_one(db.pool()).await?;

    let mut query = QueryBuilder::<Sqlite>::new(
        "SELECT created_at, source, client, op, fields, changes FROM activity WHERE 1 = 1",
    );
    push_history(&mut query, entity, entity_id);
    query
        .push(" ORDER BY id DESC LIMIT ")
        .push_bind(clamp_limit(limit))
        .push(" OFFSET ")
        .push_bind(offset.unwrap_or(0).max(0));
    let rows: Vec<HistoryRow> = query.build_query_as().fetch_all(db.pool()).await?;
    let items: Vec<Value> = rows
        .into_iter()
        .map(|row| {
            json!({
                "ts": row.0,
                "source": row.1,
                "client": row.2,
                "op": row.3,
                "fields": parse_fields(&row.4),
                "changes": parse_changes(row.5.as_deref()),
            })
        })
        .collect();
    Ok(json!({ "items": items, "total": total }))
}

pub fn validate_activity_search(search: &ActivitySearch) -> Result<()> {
    if search.limit.is_some_and(|limit| limit <= 0) {
        return Err(AppError::validation("limit must be a positive number"));
    }
    if search.offset.is_some_and(|offset| offset < 0) {
        return Err(AppError::validation("offset must be zero or positive"));
    }
    Ok(())
}
