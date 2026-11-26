use schemars::JsonSchema;

use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

use chrono::{DateTime, Local};
use serde::Serialize;
use sqlx::{Connection, Row, SqliteConnection, sqlite::SqliteConnectOptions};

use crate::{AppError, BackupKind, Db, Result};

const SQLITE_HEADER: &[u8; 15] = b"SQLite format 3";

static RESTORING: AtomicBool = AtomicBool::new(false);

struct RestoreGuard;

impl RestoreGuard {
    fn acquire() -> Result<Self> {
        if RESTORING.swap(true, Ordering::SeqCst) {
            return Err(AppError::conflict("another restore is already running"));
        }
        Ok(Self)
    }
}

impl Drop for RestoreGuard {
    fn drop(&mut self) {
        RESTORING.store(false, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct SnapshotInfo {
    pub projects: i64,
    pub tasks: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct RestoreOutcome {
    pub snapshot: SnapshotInfo,
    #[serde(rename = "safetyPath")]
    pub safety_path: String,
}

pub fn resolve_backup(dir: &Path, kind: BackupKind, name: &str) -> Result<PathBuf> {
    if dir.as_os_str().is_empty() {
        return Err(AppError::validation(
            "the backup directory is not configured",
        ));
    }
    let path = dir.join(kind.directory()).join(name);
    if !path.is_file() {
        return Err(AppError::not_found(format!(
            "no backup {}/{name} in {}",
            kind.directory(),
            dir.display()
        )));
    }
    Ok(path)
}

fn header_looks_like_database(path: &Path) -> bool {
    use std::io::Read;
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut header = [0_u8; 15];
    match file.read_exact(&mut header) {
        Ok(()) => &header == SQLITE_HEADER,
        Err(_) => false,
    }
}

async fn open_read_only(path: &Path) -> Result<SqliteConnection> {
    let options = SqliteConnectOptions::new().filename(path).read_only(true);
    SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))
}

fn drop_sidecars(path: &Path) {
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{suffix}", path.display()));
        match std::fs::remove_file(&sidecar) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {}
        }
    }
}

fn drop_empty_sidecars(path: &Path) {
    let wal = PathBuf::from(format!("{}-wal", path.display()));
    let empty = match std::fs::metadata(&wal) {
        Ok(metadata) => metadata.len() == 0,
        Err(_) => true,
    };
    if empty {
        drop_sidecars(path);
    }
}

pub async fn inspect_snapshot(path: &Path) -> Result<SnapshotInfo> {
    if !path.is_file() {
        return Err(AppError::not_found(format!(
            "backup not found: {}",
            path.display()
        )));
    }
    if !header_looks_like_database(path) {
        return Err(AppError::validation(format!(
            "not a SQLite database: {}",
            path.display()
        )));
    }

    let mut connection = open_read_only(path).await?;

    let verdict: String = sqlx::query("PRAGMA integrity_check")
        .fetch_one(&mut connection)
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?
        .get(0);
    if verdict != "ok" {
        return Err(AppError::validation(format!(
            "integrity check failed: {verdict}"
        )));
    }

    let table: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .fetch_optional(&mut connection)
    .await
    .map_err(|error| AppError::unexpected(error.to_string()))?;
    if table.is_none() {
        return Err(AppError::validation(
            "no schema_migrations table, this is not a backup",
        ));
    }

    let applied: Vec<String> = sqlx::query_scalar("SELECT name FROM schema_migrations")
        .fetch_all(&mut connection)
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;
    let known = crate::migrations::known_migrations();
    let unknown: Vec<&str> = applied
        .iter()
        .map(String::as_str)
        .filter(|name| !known.contains(name))
        .collect();
    if !unknown.is_empty() {
        return Err(AppError::validation(format!(
            "the snapshot comes from a newer version, deploy it first: {}",
            unknown.join(", ")
        )));
    }

    let projects: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects")
        .fetch_one(&mut connection)
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;
    let tasks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks")
        .fetch_one(&mut connection)
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;

    connection
        .close()
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;
    drop_empty_sidecars(path);

    Ok(SnapshotInfo { projects, tasks })
}

fn safety_name(now: DateTime<Local>) -> String {
    let stamp = now
        .with_timezone(&chrono::Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
        .replace([':', '.'], "-");
    format!("xboct-log-before-restore-{stamp}.db")
}

async fn stage_snapshot(source: &Path, staged: &Path) -> Result<()> {
    drop_sidecars(staged);
    match std::fs::remove_file(staged) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(AppError::from(error)),
    }
    std::fs::copy(source, staged)?;

    let staged_db = Db::open(staged).await?;
    let migrated = staged_db.migrate().await;
    staged_db.close().await;
    drop_sidecars(staged);
    migrated
}

async fn table_names(connection: &mut SqliteConnection) -> Result<Vec<String>> {
    let names: Vec<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_sqlx_migrations' ORDER BY name",
    )
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| AppError::unexpected(error.to_string()))?;
    Ok(names)
}

async fn column_names(connection: &mut SqliteConnection, table: &str) -> Result<Vec<String>> {
    let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
        "PRAGMA table_info({})",
        quote(table)
    )))
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| AppError::unexpected(error.to_string()))?;
    Ok(rows
        .iter()
        .map(|row| row.get::<String, _>("name"))
        .collect())
}

fn quote(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

async fn replace_contents(db: &Db, staged: &Path) -> Result<()> {
    let mut connection = db
        .pool()
        .acquire()
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;

    sqlx::query("ATTACH DATABASE ? AS restore")
        .bind(staged.to_string_lossy().into_owned())
        .execute(&mut *connection)
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;

    let result = copy_tables(&mut connection).await;
    let detached = sqlx::query("DETACH DATABASE restore")
        .execute(&mut *connection)
        .await;
    drop(connection);

    result?;
    detached.map_err(|error| AppError::unexpected(error.to_string()))?;
    Ok(())
}

async fn copy_tables(connection: &mut SqliteConnection) -> Result<()> {
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;

    let copied = copy_tables_inner(connection).await;
    match copied {
        Ok(()) => {
            sqlx::query("COMMIT")
                .execute(&mut *connection)
                .await
                .map_err(|error| AppError::unexpected(error.to_string()))?;
            Ok(())
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}

async fn copy_tables_inner(connection: &mut SqliteConnection) -> Result<()> {
    sqlx::query("PRAGMA defer_foreign_keys = ON")
        .execute(&mut *connection)
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;

    let tables = table_names(connection).await?;
    let mut plan: Vec<(String, String)> = Vec::with_capacity(tables.len());
    for table in &tables {
        let columns = column_names(connection, table).await?;
        let list = columns
            .iter()
            .map(|column| quote(column))
            .collect::<Vec<String>>()
            .join(", ");
        plan.push((quote(table), list));
    }

    for (quoted, _) in &plan {
        sqlx::query(sqlx::AssertSqlSafe(format!("DELETE FROM {quoted}")))
            .execute(&mut *connection)
            .await
            .map_err(|error| AppError::unexpected(error.to_string()))?;
    }
    for (quoted, list) in &plan {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "INSERT INTO {quoted} ({list}) SELECT {list} FROM restore.{quoted}"
        )))
        .execute(&mut *connection)
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;
    }
    Ok(())
}

async fn copy_closed_database(db_path: &Path, target: &Path) -> Result<()> {
    let db = Db::open(db_path).await?;
    let copied = crate::backup::copy_database(&db, target).await;
    db.close().await;
    copied
}

pub async fn restore_snapshot_offline(
    source: &Path,
    db_path: &Path,
    backup_dir: &Path,
    now: DateTime<Local>,
) -> Result<RestoreOutcome> {
    let _guard = RestoreGuard::acquire()?;
    let snapshot = inspect_snapshot(source).await?;

    let staged = PathBuf::from(format!("{}.new", db_path.display()));
    stage_snapshot(source, &staged).await?;

    let mut safety_path = String::new();
    if db_path.is_file() {
        let manual_dir = backup_dir.join(BackupKind::Manual.directory());
        std::fs::create_dir_all(&manual_dir)?;
        let safety = manual_dir.join(safety_name(now));
        if let Err(error) = copy_closed_database(db_path, &safety).await {
            let _ = std::fs::remove_file(&staged);
            return Err(error);
        }
        safety_path = safety.to_string_lossy().into_owned();
    }

    if let Err(error) = std::fs::rename(&staged, db_path) {
        let _ = std::fs::remove_file(&staged);
        return Err(AppError::from(error));
    }
    drop_sidecars(db_path);

    Ok(RestoreOutcome {
        snapshot,
        safety_path,
    })
}

pub async fn restore_backup(
    db: &Db,
    db_path: &Path,
    backup_dir: &Path,
    kind: BackupKind,
    name: &str,
    now: DateTime<Local>,
) -> Result<RestoreOutcome> {
    let _guard = RestoreGuard::acquire()?;
    let source = resolve_backup(backup_dir, kind, name)?;
    let snapshot = inspect_snapshot(&source).await?;

    let staged = PathBuf::from(format!("{}.new", db_path.display()));
    stage_snapshot(&source, &staged).await?;

    let manual_dir = backup_dir.join(BackupKind::Manual.directory());
    std::fs::create_dir_all(&manual_dir)?;
    let safety_path = manual_dir.join(safety_name(now));
    crate::backup::copy_database(db, &safety_path).await?;

    let swapped = replace_contents(db, &staged).await;
    drop_sidecars(&staged);
    let _ = std::fs::remove_file(&staged);
    swapped?;

    crate::projects::ensure_inbox(db).await?;
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(db.pool())
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;

    Ok(RestoreOutcome {
        snapshot,
        safety_path: safety_path.to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(hour: u32) -> DateTime<Local> {
        chrono::TimeZone::with_ymd_and_hms(&Local, 2026, 1, 4, hour, 0, 0)
            .single()
            .unwrap()
    }

    async fn migrated(path: &Path) {
        let db = Db::open(path).await.unwrap();
        db.migrate().await.unwrap();
        db.close().await;
    }

    async fn project_count(path: &Path) -> i64 {
        let db = Db::open(path).await.unwrap();
        let count = sqlx::query_scalar("SELECT COUNT(*) FROM projects")
            .fetch_one(db.pool())
            .await
            .unwrap();
        db.close().await;
        count
    }

    #[tokio::test]
    async fn replaces_the_database_with_the_snapshot() {
        let dir = xboct_log_test_support::scratch_dir("restore-offline");
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("snapshot.db");
        migrated(&source).await;

        let db_path = dir.join("xboct-log.db");
        migrated(&db_path).await;
        let live = Db::open(&db_path).await.unwrap();
        crate::projects::ensure_inbox(&live).await.unwrap();
        live.close().await;
        assert_eq!(project_count(&db_path).await, 1);

        let outcome = restore_snapshot_offline(&source, &db_path, &dir.join("backups"), at(4))
            .await
            .unwrap();

        assert_eq!(outcome.snapshot.projects, 0);
        assert_eq!(project_count(&db_path).await, 0);
        let safety = PathBuf::from(&outcome.safety_path);
        assert!(safety.is_file());
        assert_eq!(project_count(&safety).await, 1);
        assert!(!dir.join("xboct-log.db.new").exists());
        assert!(!dir.join("xboct-log.db-wal").exists());

        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn restores_without_a_previous_database() {
        let dir = xboct_log_test_support::scratch_dir("restore-offline-fresh");
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("snapshot.db");
        migrated(&source).await;
        let db_path = dir.join("xboct-log.db");

        let outcome = restore_snapshot_offline(&source, &db_path, &dir.join("backups"), at(4))
            .await
            .unwrap();

        assert!(outcome.safety_path.is_empty());
        assert_eq!(project_count(&db_path).await, 0);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn refuses_a_file_that_is_not_a_snapshot() {
        let dir = xboct_log_test_support::scratch_dir("restore-offline-bad");
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("notes.db");
        std::fs::write(&source, b"not a database").unwrap();
        let db_path = dir.join("xboct-log.db");
        std::fs::write(&db_path, b"kept").unwrap();

        let error = restore_snapshot_offline(&source, &db_path, &dir.join("backups"), at(4))
            .await
            .unwrap_err();

        assert_eq!(
            error.to_string(),
            format!("not a SQLite database: {}", source.display())
        );
        assert_eq!(std::fs::read(&db_path).unwrap(), b"kept");

        let _ = std::fs::remove_dir_all(dir);
    }
}
