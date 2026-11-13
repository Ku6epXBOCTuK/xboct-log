use chrono::{DateTime, Local};

use crate::{Db, Result};

pub async fn prune_activity(db: &Db, keep_days: i64, now: DateTime<Local>) -> Result<u64> {
    let exists: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'activity'",
    )
    .fetch_optional(db.pool())
    .await?;
    if exists.is_none() {
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
