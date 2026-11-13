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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SnapshotInfo {
    pub projects: i64,
    pub tasks: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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
