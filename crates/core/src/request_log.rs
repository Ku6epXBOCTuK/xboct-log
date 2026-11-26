use chrono::{DateTime, Local};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use sqlx::{QueryBuilder, Sqlite};

use crate::{AppError, Db, Limit, Offset, Result};

const REDACTED_VALUE: &str = "<omitted>";
const REDACTED_FIELDS: [&str; 3] = ["description", "body", "content_base64"];

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

#[derive(Debug, Default)]
pub struct RequestLogFilter {
    pub op: Option<String>,
    pub status: Option<RequestStatus>,
    pub client: Option<String>,
    pub params_hash: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
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

fn push_filters(query: &mut QueryBuilder<Sqlite>, filter: &RequestLogFilter) {
    if let Some(op) = &filter.op {
        query.push(" AND op = ").push_bind(op.as_str());
    }
    if let Some(status) = &filter.status {
        query.push(" AND status = ").push_bind(status.as_str());
    }
    if let Some(client) = &filter.client {
        query.push(" AND client = ").push_bind(client.as_str());
    }
    if let Some(hash) = &filter.params_hash {
        query.push(" AND params_hash = ").push_bind(hash.as_str());
    }
    if let Some(from) = &filter.from {
        query.push(" AND created_at >= ").push_bind(from.as_str());
    }
    if let Some(to) = &filter.to {
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

pub async fn search_request_log(
    db: &Db,
    filter: &RequestLogFilter,
    limit: Limit,
    offset: Offset,
) -> Result<RequestLogPage> {
    if !db.table_exists("request_log").await? {
        return Ok(RequestLogPage {
            items: Vec::new(),
            total: 0,
        });
    }

    let mut count = QueryBuilder::<Sqlite>::new("SELECT COUNT(*) FROM request_log WHERE 1 = 1");
    push_filters(&mut count, filter);
    let total: i64 = count.build_query_scalar().fetch_one(db.pool()).await?;

    let mut query = QueryBuilder::<Sqlite>::new(
        "SELECT created_at, client, op, params_hash, params, status, error_kind, error_message, duration_ms FROM request_log WHERE 1 = 1",
    );
    push_filters(&mut query, filter);
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

pub async fn export_request_log(
    db: &Db,
    filter: &RequestLogFilter,
    limit: Limit,
    offset: Offset,
) -> Result<RequestLogExport> {
    if !db.table_exists("request_log").await? {
        return Ok(RequestLogExport {
            content: String::new(),
            count: 0,
        });
    }
    let mut query = QueryBuilder::<Sqlite>::new(
        "SELECT created_at, client, op, params_hash, params, status, error_kind, error_message, duration_ms FROM request_log WHERE 1 = 1",
    );
    push_filters(&mut query, filter);
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
    use crate::{DEFAULT_LIMIT, MAX_LIMIT, validate_limit, validate_offset};
    use chrono::TimeZone;
    use serde_json::json;
    use xboct_log_test_support::scratch_dir;

    fn parts(default: i64, max: i64) -> (Limit, Offset) {
        (
            validate_limit(None, default, max).unwrap(),
            validate_offset(None).unwrap(),
        )
    }

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

        let filter = RequestLogFilter {
            status: Some(RequestStatus::Error),
            ..RequestLogFilter::default()
        };
        let (limit, offset) = parts(DEFAULT_LIMIT, MAX_LIMIT);
        let page = search_request_log(&db, &filter, limit, offset)
            .await
            .unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.items[0].op, "tasks_update");
        assert_eq!(page.items[0].error_kind.as_deref(), Some("validation"));

        let (limit, offset) = parts(10_000, 10_000);
        let export = export_request_log(&db, &RequestLogFilter::default(), limit, offset)
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

        let (limit, offset) = parts(1, MAX_LIMIT);
        let page = search_request_log(&db, &RequestLogFilter::default(), limit, offset)
            .await
            .unwrap();
        assert_eq!(page.total, 2);
        assert_eq!(page.items.len(), 1);
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
        let (limit, offset) = parts(DEFAULT_LIMIT, MAX_LIMIT);
        let page = search_request_log(&db, &RequestLogFilter::default(), limit, offset)
            .await
            .unwrap();
        assert_eq!(page.total, 1);
    }
}
