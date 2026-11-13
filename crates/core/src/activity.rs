use std::collections::HashMap;

use chrono::{DateTime, Local};
use serde::Serialize;
use serde_json::Value;
use sqlx::QueryBuilder;

use crate::{ActivityEntity, ActivitySource, Db, Result};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ActivityEntry {
    pub entity: ActivityEntity,
    pub entity_id: String,
    pub entity_task_id: Option<String>,
    pub fields: Vec<String>,
    pub changes: Vec<Value>,
}

impl ActivityEntry {
    pub fn new(
        entity: ActivityEntity,
        entity_id: impl ToString,
        fields: Vec<String>,
        changes: Vec<Value>,
    ) -> Self {
        Self {
            entity,
            entity_id: entity_id.to_string(),
            entity_task_id: None,
            fields,
            changes,
        }
    }

    pub fn task(task_id: impl ToString, fields: Vec<String>, changes: Vec<Value>) -> Self {
        Self::new(ActivityEntity::Task, task_id, fields, changes)
    }
}

async fn activity_table_exists(db: &Db) -> Result<bool> {
    let exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'activity'",
    )
    .fetch_optional(db.pool())
    .await?;
    Ok(exists.is_some())
}

async fn task_ids_by_key(db: &Db, entries: &[ActivityEntry]) -> Result<HashMap<String, String>> {
    let mut keys: Vec<String> = Vec::new();
    for entry in entries {
        if entry.entity == ActivityEntity::Task && !keys.contains(&entry.entity_id) {
            keys.push(entry.entity_id.clone());
        }
    }
    if keys.is_empty() {
        return Ok(HashMap::new());
    }
    let mut builder: QueryBuilder<sqlx::Sqlite> =
        QueryBuilder::new("SELECT key, id FROM tasks WHERE key IN (");
    let mut separated = builder.separated(", ");
    for key in &keys {
        separated.push_bind(key);
    }
    separated.push_unseparated(")");
    let rows: Vec<(String, String)> = builder.build_query_as().fetch_all(db.pool()).await?;
    Ok(rows.into_iter().collect())
}

pub async fn record_activity(
    db: &Db,
    source: ActivitySource,
    op: &str,
    entries: &[ActivityEntry],
    client: Option<&str>,
    now: DateTime<Local>,
) -> Result<u64> {
    if entries.is_empty() || !activity_table_exists(db).await? {
        return Ok(0);
    }
    let created_at = now
        .with_timezone(&chrono::Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let task_ids = task_ids_by_key(db, entries).await?;
    for entry in entries {
        let entity_task_id = entry
            .entity_task_id
            .clone()
            .or_else(|| task_ids.get(&entry.entity_id).cloned());
        let fields = serde_json::to_string(&entry.fields)
            .map_err(|error| crate::AppError::unexpected(error.to_string()))?;
        let changes = serde_json::to_string(&entry.changes)
            .map_err(|error| crate::AppError::unexpected(error.to_string()))?;
        sqlx::query(
            "INSERT INTO activity (created_at, source, client, op, entity, entity_id, entity_task_id, fields, changes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&created_at)
        .bind(source.as_str())
        .bind(client)
        .bind(op)
        .bind(entry.entity.as_str())
        .bind(&entry.entity_id)
        .bind(entity_task_id)
        .bind(fields)
        .bind(changes)
        .execute(db.pool())
        .await?;
    }
    Ok(entries.len() as u64)
}

pub async fn prune_activity(db: &Db, keep_days: i64, now: DateTime<Local>) -> Result<u64> {
    if !activity_table_exists(db).await? {
        return Ok(0);
    }

    let cutoff = (now - chrono::Duration::days(keep_days))
        .with_timezone(&chrono::Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let result = sqlx::query("DELETE FROM activity WHERE created_at < ?")
        .bind(cutoff)
        .execute(db.pool())
        .await?;
    Ok(result.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(hour: u32) -> DateTime<Local> {
        Local
            .with_ymd_and_hms(2026, 1, 4, hour, 0, 0)
            .single()
            .unwrap()
    }

    fn scratch_dir() -> std::path::PathBuf {
        crate::test_support::scratch_dir("activity")
    }

    #[tokio::test]
    async fn removes_entries_older_than_the_window() {
        let dir = scratch_dir();
        let db = Db::open(dir.join("tasks.db")).await.unwrap();
        sqlx::query("CREATE TABLE activity (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL)")
            .execute(db.pool())
            .await
            .unwrap();
        sqlx::query("INSERT INTO activity (created_at) VALUES ('2025-01-01T00:00:00.000Z')")
            .execute(db.pool())
            .await
            .unwrap();
        sqlx::query("INSERT INTO activity (created_at) VALUES ('2026-01-03T00:00:00.000Z')")
            .execute(db.pool())
            .await
            .unwrap();

        let removed = prune_activity(&db, 365, at(12)).await.unwrap();
        assert_eq!(removed, 1);
        let left: i64 = sqlx::query_scalar("SELECT count(*) FROM activity")
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(left, 1);

        db.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn ignores_a_database_without_activity() {
        let dir = scratch_dir();
        let db = Db::open(dir.join("tasks.db")).await.unwrap();
        assert_eq!(prune_activity(&db, 365, at(12)).await.unwrap(), 0);
        db.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }
}
