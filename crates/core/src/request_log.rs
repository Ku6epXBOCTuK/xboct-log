use chrono::{DateTime, Local};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use sqlx::{QueryBuilder, Sqlite};

use crate::{AppError, DEFAULT_LIMIT, Db, MAX_LIMIT, Result, validate_limit, validate_offset};

const REDACTED_VALUE: &str = "<omitted>";
const REDACTED_FIELDS: [&str; 3] = ["description", "body", "content_base64"];
const EXPORT_LIMIT: i64 = 10000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum RequestStatus {
    Ok,
    Error,
}

impl RequestStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            RequestStatus::Ok => "ok",
            RequestStatus::Error => "error",
        }
    }

    fn parse(raw: &str) -> Self {
        if raw == "error" {
            RequestStatus::Error
        } else {
            RequestStatus::Ok
        }
    }
}

#[derive(Debug, Clone)]
pub struct RequestLogEntry {
    pub op: String,
    pub client: Option<String>,
    pub params: Value,
    pub status: RequestStatus,
    pub error_kind: Option<String>,
    pub error_message: Option<String>,
    pub duration_ms: i64,
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RequestLogSearch {
    #[schemars(description = "Tool name, for example tasks_list.")]
    #[serde(default)]
    pub op: Option<String>,
    #[schemars(description = "Only successful or only failed calls.")]
    #[serde(default)]
    pub status: Option<RequestStatus>,
    #[schemars(description = "MCP client label.")]
    #[serde(default)]
    pub client: Option<String>,
    #[schemars(description = "Fingerprint of the tool name and parameters, for repeated calls.")]
    #[serde(default)]
    pub params_hash: Option<String>,
    #[schemars(description = "Start of the period as an ISO date-time.")]
    #[serde(default)]
    pub from: Option<String>,
    #[schemars(description = "End of the period as an ISO date-time.")]
    #[serde(default)]
    pub to: Option<String>,
    #[schemars(description = "Maximum number of calls to return (default 50, max 200).")]
    #[serde(default)]
    pub limit: Option<i64>,
    #[schemars(description = "Number of calls to skip, for pagination.")]
    #[serde(default)]
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct RequestLogItem {
    pub ts: String,
    pub client: Option<String>,
    pub op: String,
    pub params_hash: String,
    pub params: Value,
    pub status: RequestStatus,
    pub error_kind: Option<String>,
    pub error_message: Option<String>,
    pub duration_ms: i64,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct RequestLogPage {
    pub items: Vec<RequestLogItem>,
    pub total: i64,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct RequestLogExport {
    pub content: String,
    pub count: i64,
}

pub fn redact_params(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut redacted = Map::new();
            for (key, child) in map {
                if REDACTED_FIELDS.contains(&key.as_str()) {
                    redacted.insert(key.clone(), Value::String(REDACTED_VALUE.to_string()));
                } else {
                    redacted.insert(key.clone(), redact_params(child));
                }
            }
            Value::Object(redacted)
        }
        Value::Array(items) => Value::Array(items.iter().map(redact_params).collect()),
        other => other.clone(),
    }
}

fn sorted_params(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<_> = map.iter().collect();
            entries.sort_by(|left, right| left.0.cmp(right.0));
            let mut sorted = Map::new();
            for (key, child) in entries {
                sorted.insert(key.clone(), sorted_params(child));
            }
            Value::Object(sorted)
        }
        Value::Array(items) => Value::Array(items.iter().map(sorted_params).collect()),
        other => other.clone(),
    }
}

pub fn params_hash(op: &str, params: &Value) -> String {
    let params = redact_params(params);
    let canonical = serde_json::to_string(&sorted_params(&params)).unwrap_or_default();
    let digest = Sha256::digest(format!("{op}\n{canonical}").as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn validate_request_log_search(search: &RequestLogSearch) -> Result<()> {
    validate_limit(search.limit, DEFAULT_LIMIT, MAX_LIMIT)?;
    validate_offset(search.offset)?;
    Ok(())
}

pub async fn record_request(db: &Db, entry: &RequestLogEntry, now: DateTime<Local>) -> Result<u64> {
    if !db.table_exists("request_log").await? {
        return Ok(0);
    }
    let created_at = now
        .with_timezone(&chrono::Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let params = redact_params(&entry.params);
    let hash = params_hash(&entry.op, &params);
    let raw =
        serde_json::to_string(&params).map_err(|error| AppError::unexpected(error.to_string()))?;
    let result = sqlx::query(
        "INSERT INTO request_log (created_at, client, op, params_hash, params, status, error_kind, error_message, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(created_at)
    .bind(&entry.client)
    .bind(&entry.op)
    .bind(hash)
    .bind(raw)
    .bind(entry.status.as_str())
    .bind(&entry.error_kind)
    .bind(&entry.error_message)
    .bind(entry.duration_ms)
    .execute(db.pool())
    .await?;
    Ok(result.rows_affected())
}

fn push_filters(query: &mut QueryBuilder<Sqlite>, search: &RequestLogSearch) {
    if let Some(op) = &search.op {
        query.push(" AND op = ").push_bind(op.as_str());
    }
    if let Some(status) = &search.status {
        query.push(" AND status = ").push_bind(status.as_str());
    }
    if let Some(client) = &search.client {
        query.push(" AND client = ").push_bind(client.as_str());
    }
    if let Some(hash) = &search.params_hash {
        query.push(" AND params_hash = ").push_bind(hash.as_str());
    }
    if let Some(from) = &search.from {
        query.push(" AND created_at >= ").push_bind(from.as_str());
    }
    if let Some(to) = &search.to {
        query.push(" AND created_at <= ").push_bind(to.as_str());
    }
}

type Row = (
    String,
    Option<String>,
    String,
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    i64,
);

fn parse_params(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or(Value::Null)
}

fn to_item(row: Row) -> RequestLogItem {
    RequestLogItem {
        ts: row.0,
        client: row.1,
        op: row.2,
        params_hash: row.3,
        params: parse_params(&row.4),
        status: RequestStatus::parse(&row.5),
        error_kind: row.6,
        error_message: row.7,
        duration_ms: row.8,
    }
}

pub async fn search_request_log(db: &Db, search: &RequestLogSearch) -> Result<RequestLogPage> {
    if !db.table_exists("request_log").await? {
        return Ok(RequestLogPage {
            items: Vec::new(),
            total: 0,
        });
    }
    let limit = validate_limit(search.limit, DEFAULT_LIMIT, MAX_LIMIT)?;
    let offset = validate_offset(search.offset)?;

    let mut count = QueryBuilder::<Sqlite>::new("SELECT COUNT(*) FROM request_log WHERE 1 = 1");
    push_filters(&mut count, search);
    let total: i64 = count.build_query_scalar().fetch_one(db.pool()).await?;

    let mut query = QueryBuilder::<Sqlite>::new(
        "SELECT created_at, client, op, params_hash, params, status, error_kind, error_message, duration_ms FROM request_log WHERE 1 = 1",
    );
    push_filters(&mut query, search);
    query
        .push(" ORDER BY id DESC LIMIT ")
        .push_bind(limit.get())
        .push(" OFFSET ")
        .push_bind(offset.get());
    let rows: Vec<Row> = query.build_query_as().fetch_all(db.pool()).await?;
    Ok(RequestLogPage {
        items: rows.into_iter().map(to_item).collect(),
        total,
    })
}

pub async fn export_request_log(db: &Db, search: &RequestLogSearch) -> Result<RequestLogExport> {
    if !db.table_exists("request_log").await? {
        return Ok(RequestLogExport {
            content: String::new(),
            count: 0,
        });
    }
    let limit = validate_limit(search.limit, EXPORT_LIMIT, EXPORT_LIMIT)?;
    let offset = validate_offset(search.offset)?;
    let mut query = QueryBuilder::<Sqlite>::new(
        "SELECT created_at, client, op, params_hash, params, status, error_kind, error_message, duration_ms FROM request_log WHERE 1 = 1",
    );
    push_filters(&mut query, search);
    query
        .push(" ORDER BY id ASC LIMIT ")
        .push_bind(limit.get())
        .push(" OFFSET ")
        .push_bind(offset.get());
    let rows: Vec<Row> = query.build_query_as().fetch_all(db.pool()).await?;
    let mut content = String::new();
    for row in rows {
        let item = to_item(row);
        let line = serde_json::to_string(&item)
            .map_err(|error| AppError::unexpected(error.to_string()))?;
        content.push_str(&line);
        content.push('\n');
    }
    Ok(RequestLogExport {
        count: content.lines().count() as i64,
        content,
    })
}

pub async fn prune_request_log(db: &Db, keep_days: i64, now: DateTime<Local>) -> Result<u64> {
    if !db.table_exists("request_log").await? {
        return Ok(0);
    }
    let cutoff = (now - chrono::Duration::days(keep_days))
        .with_timezone(&chrono::Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let result = sqlx::query("DELETE FROM request_log WHERE created_at < ?")
        .bind(cutoff)
        .execute(db.pool())
        .await?;
    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::scratch_dir;
    use chrono::TimeZone;
    use serde_json::json;

    fn at(day: u32, hour: u32) -> DateTime<Local> {
        Local
            .with_ymd_and_hms(2026, 1, day, hour, 0, 0)
            .single()
            .unwrap()
    }

    async fn db() -> Db {
        let db = Db::open(scratch_dir("request_log").join("tasks.db"))
            .await
            .unwrap();
        db.migrate().await.unwrap();
        db
    }

    fn entry(op: &str, params: Value) -> RequestLogEntry {
        RequestLogEntry {
            op: op.to_string(),
            client: Some("test/1".to_string()),
            params,
            status: RequestStatus::Ok,
            error_kind: None,
            error_message: None,
            duration_ms: 12,
        }
    }

    #[test]
    fn redacts_text_fields_recursively() {
        let raw = json!({
            "title": "keep",
            "description": "secret",
            "patch": {"description": "hidden", "status": "open"},
            "items": [{"body": "comment", "body2": "keep"}]
        });
        let redacted = redact_params(&raw);
        assert_eq!(redacted["title"], json!("keep"));
        assert_eq!(redacted["description"], json!("<omitted>"));
        assert_eq!(redacted["patch"]["description"], json!("<omitted>"));
        assert_eq!(redacted["patch"]["status"], json!("open"));
        assert_eq!(redacted["items"][0]["body"], json!("<omitted>"));
        assert_eq!(redacted["items"][0]["body2"], json!("keep"));
    }

    #[test]
    fn hashes_independently_of_key_order_and_redacts_before_hashing() {
        let left = json!({"a": 1, "description": "one", "b": 2});
        let right = json!({"b": 2, "description": "two", "a": 1});
        assert_eq!(
            params_hash("tasks_update", &left),
            params_hash("tasks_update", &right)
        );
        assert_ne!(
            params_hash("tasks_update", &left),
            params_hash("tasks_create", &left)
        );
    }

    #[tokio::test]
    async fn records_searches_and_exports_calls() {
        let db = db().await;
        record_request(&db, &entry("tasks_list", json!({"limit": 5})), at(4, 1))
            .await
            .unwrap();
        let mut failed = entry("tasks_update", json!({"task_id": "LOG-1", "status": "bad"}));
        failed.status = RequestStatus::Error;
        failed.error_kind = Some("validation".to_string());
        failed.error_message = Some("unknown status".to_string());
        record_request(&db, &failed, at(4, 2)).await.unwrap();

        let page = search_request_log(
            &db,
            &RequestLogSearch {
                status: Some(RequestStatus::Error),
                ..RequestLogSearch::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.items[0].op, "tasks_update");
        assert_eq!(page.items[0].error_kind.as_deref(), Some("validation"));

        let export = export_request_log(&db, &RequestLogSearch::default())
            .await
            .unwrap();
        assert_eq!(export.count, 2);
        assert!(export.content.contains("tasks_list"));
        assert!(
            export
                .content
                .lines()
                .all(|line| serde_json::from_str::<Value>(line).is_ok())
        );
    }

    #[tokio::test]
    async fn prunes_calls_older_than_the_window() {
        let db = db().await;
        record_request(&db, &entry("tasks_list", json!({})), at(1, 1))
            .await
            .unwrap();
        record_request(&db, &entry("tasks_list", json!({})), at(20, 1))
            .await
            .unwrap();

        assert_eq!(prune_request_log(&db, 5, at(20, 1)).await.unwrap(), 1);
        let page = search_request_log(&db, &RequestLogSearch::default())
            .await
            .unwrap();
        assert_eq!(page.total, 1);
    }
}
