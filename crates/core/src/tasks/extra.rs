use schemars::JsonSchema;

use serde::Serialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;

use crate::ids::TaskKey;
use crate::{AppError, Db, Result, validate_limit, validate_offset};

use super::filters::TaskFilters;
use super::model::{Status, Task, TaskListEntry, TaskStats};
use super::resolve::resolve_task_id;
use super::sql::{list_tasks, list_tasks_unchecked, task_by_key};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchTerm {
    Text(String),
    Number(i64),
    Id(String),
}

fn is_digits(value: &str) -> bool {
    !value.is_empty() && value.chars().all(|character| character.is_ascii_digit())
}

fn is_task_id(value: &str) -> bool {
    let Some((prefix, number)) = value.rsplit_once('-') else {
        return false;
    };
    !prefix.is_empty()
        && prefix
            .chars()
            .next()
            .is_some_and(|first| first.is_ascii_alphabetic())
        && prefix
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
        && is_digits(number)
}

fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for character in input.chars() {
        if character == '"' {
            quoted = !quoted;
        } else if character.is_whitespace() && !quoted {
            if !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
        } else {
            current.push(character);
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn parse_term(token: &str) -> Option<SearchTerm> {
    if let Some(rest) = token.strip_prefix('=') {
        let value = rest.trim();
        if value.is_empty() {
            return None;
        }
        if is_digits(value) {
            return value.parse::<i64>().ok().map(SearchTerm::Number);
        }
        if is_task_id(value) {
            return Some(SearchTerm::Id(value.to_uppercase()));
        }
        return Some(SearchTerm::Text(value.to_lowercase()));
    }
    Some(SearchTerm::Text(token.to_lowercase()))
}

pub fn parse_search_query(input: &str) -> Vec<SearchTerm> {
    tokenize(input)
        .iter()
        .filter_map(|token| parse_term(token))
        .collect()
}

pub async fn count_by_status(
    db: &Db,
    project_id: Option<&str>,
    is_epic: bool,
) -> Result<BTreeMap<Status, i64>> {
    let mut sql =
        String::from("SELECT status, COUNT(*) FROM tasks WHERE deleted_at IS NULL AND is_epic = ?");
    if project_id.is_some() {
        sql.push_str(" AND project_id = ?");
    }
    sql.push_str(" GROUP BY status");

    let mut query = sqlx::query_as(sqlx::AssertSqlSafe(sql)).bind(i64::from(is_epic));
    if let Some(project_id) = project_id {
        query = query.bind(project_id);
    }
    let rows: Vec<(String, i64)> = query.fetch_all(db.pool()).await?;

    let mut counts: BTreeMap<Status, i64> = Status::ALL.iter().map(|status| (*status, 0)).collect();
    for (status, count) in rows {
        if let Ok(status) = serde_json::from_value::<Status>(Value::String(status)) {
            counts.insert(status, count);
        }
    }
    Ok(counts)
}

pub async fn count_tasks_by_status(db: &Db) -> Result<BTreeMap<Status, i64>> {
    count_by_status(db, None, false).await
}

pub async fn count_children_by_epic(db: &Db) -> Result<BTreeMap<String, BTreeMap<String, i64>>> {
    let rows: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT epic.key, tasks.status, COUNT(*) FROM tasks JOIN tasks epic ON epic.id = tasks.epic_id WHERE tasks.deleted_at IS NULL GROUP BY epic.key, tasks.status",
    )
    .fetch_all(db.pool())
    .await?;
    let mut counts: BTreeMap<String, BTreeMap<String, i64>> = BTreeMap::new();
    for (epic, status, count) in rows {
        let entry = counts.entry(epic).or_insert_with(|| {
            let mut empty = BTreeMap::new();
            for status in Status::ALL {
                let name = serde_json::to_value(status)
                    .ok()
                    .and_then(|value| value.as_str().map(str::to_owned))
                    .unwrap_or_default();
                empty.insert(name, 0);
            }
            empty.insert("total".to_string(), 0);
            empty
        });
        entry.insert(status, count);
        *entry.entry("total".to_string()).or_insert(0) += count;
    }
    Ok(counts)
}

pub async fn task_stats(db: &Db) -> Result<TaskStats> {
    let tasks = count_tasks_by_status(db).await?;
    let children = count_children_by_epic(db).await?;
    let filters: TaskFilters = serde_json::from_value(json!({
        "is_epic": true,
        "sort": "number",
        "order": "asc"
    }))?;
    let epics = list_tasks(db, &filters)
        .await?
        .items
        .into_iter()
        .filter_map(|entry| {
            let TaskListEntry::Full(mut task) = entry else {
                return None;
            };
            if let Some(counts) = children.get(task.id.as_str()) {
                task.children_counts = Some(counts.clone());
            }
            Some(task)
        })
        .collect();
    Ok(TaskStats { tasks, epics })
}

pub async fn task_options(
    db: &Db,
    project_id: Option<&str>,
    query: Option<&str>,
    limit: Option<i64>,
) -> Result<super::model::TaskList> {
    let mut input = json!({
        "include_description": false,
        "sort": "number",
        "order": "asc"
    });
    if let Some(project_id) = project_id {
        input["project_id"] = json!(project_id);
    }
    let terms = query.map(parse_search_query).unwrap_or_default();
    let default = if terms.is_empty() { 5000 } else { 50 };
    if !terms.is_empty() {
        let mut q_any = Vec::new();
        let mut number_exact = Vec::new();
        let mut id_exact = Vec::new();
        for term in &terms {
            match term {
                SearchTerm::Text(text) => q_any.push(text.clone()),
                SearchTerm::Number(number) => {
                    q_any.push(number.to_string());
                    number_exact.push(*number);
                }
                SearchTerm::Id(id) => {
                    q_any.push(id.clone());
                    id_exact.push(id.clone());
                }
            }
        }
        input["q_any"] = json!(q_any);
        if !number_exact.is_empty() {
            input["number_exact"] = json!(number_exact);
        }
        if !id_exact.is_empty() {
            input["id_exact"] = json!(id_exact);
        }
    }
    let limit = validate_limit(limit, default, 5000)?;
    let offset = validate_offset(None)?;
    input["limit"] = json!(limit.get());
    let filters: TaskFilters = serde_json::from_value(input)?;
    list_tasks_unchecked(db, &filters, limit, offset).await
}

pub fn revision_item(row: &(i64, String, String, Option<String>, String, String)) -> Revision {
    Revision {
        id: row.0,
        task_id: TaskKey::from(row.1.clone()),
        field: row.2.clone(),
        ref_id: row.3.clone(),
        body: row.4.clone(),
        created_at: row.5.clone(),
    }
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct Revision {
    pub id: i64,
    pub task_id: TaskKey,
    pub field: String,
    pub ref_id: Option<String>,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct RevisionsPage {
    pub items: Vec<Revision>,
    pub total: i64,
}

pub async fn list_revisions(
    db: &Db,
    task_id: &str,
    field: Option<&str>,
    limit: Option<i64>,
) -> Result<RevisionsPage> {
    let key = resolve_task_id(db, task_id).await?;
    let rows: Vec<(i64, String, String, Option<String>, String, String)> = sqlx::query_as(
        "SELECT r.id, tasks.key AS task_id, r.field, r.ref_id, r.body, r.created_at FROM task_revisions r JOIN tasks ON tasks.id = r.task_id WHERE tasks.key = ? ORDER BY r.id ASC",
    )
    .bind(key.as_str())
    .fetch_all(db.pool())
    .await?;
    let limit = validate_limit(limit, 50, 200)?.get() as usize;
    let items: Vec<Revision> = rows
        .iter()
        .filter(|row| field.is_none_or(|wanted| row.2 == wanted))
        .take(limit)
        .map(revision_item)
        .collect();
    let total = items.len() as i64;
    Ok(RevisionsPage { items, total })
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct TaskMany {
    pub items: Vec<Task>,
    pub missing: Vec<String>,
}

pub async fn get_tasks_by_ids(db: &Db, ids: &[String]) -> Result<TaskMany> {
    if ids.is_empty() {
        return Err(AppError::validation("task_ids needs at least one id"));
    }
    if ids.len() > 100 {
        return Err(AppError::validation("task_ids takes at most 100 ids"));
    }
    let mut seen: Vec<String> = Vec::new();
    let mut items = Vec::new();
    let mut missing = Vec::new();
    for id in ids {
        if seen.contains(id) {
            continue;
        }
        seen.push(id.clone());
        let resolved = super::resolve::lookup_task(db, id).await?;
        match resolved {
            Some(key) => {
                let task = read_task(db, &key).await?;
                items.push(task);
            }
            None => missing.push(id.clone()),
        }
    }
    Ok(TaskMany { items, missing })
}

async fn read_task(db: &Db, key: &TaskKey) -> Result<super::model::Task> {
    task_by_key(db, key.as_str())
        .await?
        .ok_or_else(|| AppError::unexpected(format!("task {key} disappeared while reading")))
}
