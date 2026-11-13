use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{QueryBuilder, Sqlite};

use crate::{AppError, Db, ProjectId, Result};

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActivitySearch {
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub op: Option<String>,
    #[serde(default)]
    pub entity: Option<String>,
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

type SearchRow = (
    String,
    String,
    Option<String>,
    String,
    String,
    Option<String>,
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
    let mut where_sql = String::new();
    let mut first = true;
    let mut clauses: Vec<String> = Vec::new();
    let mut binds: Vec<String> = Vec::new();
    if let Some(source) = &search.source {
        clauses.push("source = ?".to_string());
        binds.push(source.clone());
    }
    if let Some(op) = &search.op {
        clauses.push("op = ?".to_string());
        binds.push(op.clone());
    }
    if let Some(entity) = &search.entity {
        clauses.push("entity = ?".to_string());
        binds.push(entity.clone());
    }
    if let Some(project_id) = &search.project_id {
        clauses.push(
            "((entity = 'project' AND entity_id = ?) OR (entity = 'task' AND (entity_id IN (SELECT key FROM tasks WHERE project_id = ?) OR entity_task_id IN (SELECT id FROM tasks WHERE project_id = ?))) OR (entity = 'scope' AND entity_id IN (SELECT CAST(id AS TEXT) FROM scopes WHERE project_id = ?)))"
                .to_string(),
        );
        for _ in 0..4 {
            binds.push(project_id.as_str().to_string());
        }
    }
    if let Some(from) = &search.from {
        clauses.push("created_at >= ?".to_string());
        binds.push(from.clone());
    }
    if let Some(to) = &search.to {
        clauses.push("created_at <= ?".to_string());
        binds.push(to.clone());
    }
    if !clauses.is_empty() {
        where_sql = format!(" WHERE {}", clauses.join(" AND "));
        first = false;
    }
    let _ = first;

    let mut count =
        QueryBuilder::<Sqlite>::new(format!("SELECT COUNT(*) FROM activity{where_sql}"));
    for bind in &binds {
        count.push_bind(bind.clone());
    }
    let total: i64 = count.build_query_scalar().fetch_one(db.pool()).await?;

    let limit = clamp_limit(search.limit);
    let offset = search.offset.unwrap_or(0).max(0);
    let mut query = QueryBuilder::<Sqlite>::new(format!(
        "SELECT created_at, source, client, op, entity, entity_id, fields, changes FROM activity{where_sql} ORDER BY id DESC LIMIT "
    ));
    for bind in &binds {
        query.push_bind(bind.clone());
    }
    query.push_bind(limit).push(" OFFSET ").push_bind(offset);
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

    let ops: Vec<String> = sqlx::query_scalar("SELECT DISTINCT op FROM activity ORDER BY op")
        .fetch_all(db.pool())
        .await?;
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
    let (where_sql, binds): (String, Vec<String>) = if entity == "task" {
        (
            " WHERE entity = ? AND (entity_id = ? OR entity_task_id = (SELECT id FROM tasks WHERE key = ?))"
                .to_string(),
            vec![entity.to_string(), entity_id.to_string(), entity_id.to_string()],
        )
    } else {
        (
            " WHERE entity = ? AND entity_id = ?".to_string(),
            vec![entity.to_string(), entity_id.to_string()],
        )
    };
    let mut count =
        QueryBuilder::<Sqlite>::new(format!("SELECT COUNT(*) FROM activity{where_sql}"));
    for bind in &binds {
        count.push_bind(bind.clone());
    }
    let total: i64 = count.build_query_scalar().fetch_one(db.pool()).await?;

    let mut query = QueryBuilder::<Sqlite>::new(format!(
        "SELECT created_at, source, client, op, fields, changes FROM activity{where_sql} ORDER BY id DESC LIMIT "
    ));
    for bind in &binds {
        query.push_bind(bind.clone());
    }
    query
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
    if search.op.as_deref().is_some_and(str::is_empty) {
        return Err(AppError::validation("op must not be empty"));
    }
    Ok(())
}
