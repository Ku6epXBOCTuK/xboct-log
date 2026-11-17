use schemars::JsonSchema;

use std::path::{Path, PathBuf};

use chrono::{DateTime, Datelike, Local, Timelike};

use crate::{AppError, BackupConfig, Db, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum BackupKind {
    Daily,
    Weekly,
    Manual,
    Auto,
}

impl BackupKind {
    pub fn directory(self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Manual => "manual",
            Self::Auto => "auto",
        }
    }

    fn keep(self, config: &BackupConfig) -> Option<i64> {
        match self {
            Self::Daily => Some(config.daily_keep),
            Self::Weekly => Some(config.weekly_keep),
            Self::Auto => Some(config.auto_keep),
            Self::Manual => None,
        }
    }
}

pub fn file_name(kind: BackupKind, now: DateTime<Local>) -> String {
    let stamp = match kind {
        BackupKind::Daily => local_date(now),
        BackupKind::Weekly => iso_week(now),
        BackupKind::Manual | BackupKind::Auto => {
            format!("{}-{}", local_date(now), local_time(now))
        }
    };
    format!("xboct-log-{stamp}.db")
}

fn local_date(now: DateTime<Local>) -> String {
    format!("{:04}-{:02}-{:02}", now.year(), now.month(), now.day())
}

fn local_time(now: DateTime<Local>) -> String {
    format!("{:02}{:02}{:02}", now.hour(), now.minute(), now.second())
}

fn iso_week(now: DateTime<Local>) -> String {
    let week = now.date_naive().iso_week();
    format!("{}-W{:02}", week.year(), week.week())
}

pub fn prune(dir: &Path, keep: i64) {
    if keep < 1 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut names: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_ok_and(|file_type| file_type.is_file()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".db"))
        .collect();
    names.sort();
    names.reverse();
    let keep = usize::try_from(keep).unwrap_or(usize::MAX);
    for name in names.into_iter().skip(keep) {
        let _ = std::fs::remove_file(dir.join(name));
    }
}

pub async fn run_backup(
    db: &Db,
    dir: &Path,
    config: &BackupConfig,
    kind: BackupKind,
    now: DateTime<Local>,
) -> Result<PathBuf> {
    if config.disabled && kind != BackupKind::Manual {
        return Ok(PathBuf::new());
    }

    let target_dir = dir.join(kind.directory());
    let target = target_dir.join(file_name(kind, now));
    std::fs::create_dir_all(&target_dir)?;
    match std::fs::remove_file(&target) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(AppError::from(error)),
    }

    copy_database(db, &target).await?;

    if let Some(keep) = kind.keep(config) {
        prune(&target_dir, keep);
    }
    Ok(target)
}

// NOTE: node copies pages with node:sqlite's backup API, so a checkpoint and a
// plain file copy of the main database must yield those same bytes.
pub async fn copy_database(db: &Db, target: &Path) -> Result<()> {
    if db.path() == Path::new(":memory:") {
        sqlx::query("VACUUM INTO ?")
            .bind(target.to_string_lossy().into_owned())
            .execute(db.pool())
            .await
            .map_err(|error| AppError::unexpected(error.to_string()))?;
        return Ok(());
    }

    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(db.pool())
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;
    std::fs::copy(db.path(), target)?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, JsonSchema)]
pub struct BackupFile {
    pub kind: BackupKind,
    pub name: String,
    pub path: PathBuf,
    pub size: u64,
    pub mtime: String,
}

pub fn list_backups(dir: &Path) -> Vec<BackupFile> {
    let mut files = Vec::new();
    for kind in [
        BackupKind::Auto,
        BackupKind::Daily,
        BackupKind::Weekly,
        BackupKind::Manual,
    ] {
        let kind_dir = dir.join(kind.directory());
        let Ok(entries) = std::fs::read_dir(&kind_dir) else {
            continue;
        };
        for entry in entries.filter_map(|entry| entry.ok()) {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.ends_with(".db") {
                continue;
            }
            let path = entry.path();
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            let Ok(modified) = metadata.modified() else {
                continue;
            };
            files.push(BackupFile {
                kind,
                name,
                path,
                size: metadata.len(),
                mtime: iso_timestamp(modified),
            });
        }
    }
    files.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    files
}

fn iso_timestamp(modified: std::time::SystemTime) -> String {
    let time: DateTime<chrono::Utc> = modified.into();
    time.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(year: i32, month: u32, day: u32, hour: u32, minute: u32, second: u32) -> DateTime<Local> {
        Local
            .with_ymd_and_hms(year, month, day, hour, minute, second)
            .single()
            .unwrap()
    }

    #[test]
    fn builds_the_node_file_names() {
        let now = at(2026, 1, 4, 3, 15, 0);
        assert_eq!(file_name(BackupKind::Daily, now), "xboct-log-2026-01-04.db");
        assert_eq!(file_name(BackupKind::Weekly, now), "xboct-log-2026-W01.db");
        assert_eq!(
            file_name(BackupKind::Manual, now),
            "xboct-log-2026-01-04-031500.db"
        );
        assert_eq!(
            file_name(BackupKind::Auto, now),
            "xboct-log-2026-01-04-031500.db"
        );
    }

    #[test]
    fn uses_the_iso_week_of_the_local_date() {
        let now = at(2025, 12, 29, 3, 0, 0);
        assert_eq!(file_name(BackupKind::Weekly, now), "xboct-log-2026-W01.db");
    }

    fn scratch_dir() -> PathBuf {
        crate::test_support::scratch_dir("backup")
    }

    #[tokio::test]
    async fn writes_a_readable_snapshot() {
        let dir = scratch_dir();
        let db = Db::open(dir.join("tasks.db")).await.unwrap();
        sqlx::query("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)")
            .execute(db.pool())
            .await
            .unwrap();
        sqlx::query("INSERT INTO notes (body) VALUES ('kept')")
            .execute(db.pool())
            .await
            .unwrap();

        let config = BackupConfig {
            hour: 3,
            minute: 0,
            weekday: 0,
            daily_keep: 7,
            weekly_keep: 4,
            auto_keep: 48,
            auto_interval_min: 30,
            disabled: false,
        };
        let path = run_backup(
            &db,
            &dir.join("backups"),
            &config,
            BackupKind::Manual,
            at(2026, 1, 4, 3, 15, 0),
        )
        .await
        .unwrap();

        assert_eq!(
            path,
            dir.join("backups/manual/xboct-log-2026-01-04-031500.db")
        );
        assert!(path.exists());

        db.close().await;
        let snapshot = Db::open(&path).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM notes")
            .fetch_one(snapshot.pool())
            .await
            .unwrap();
        assert_eq!(count, 1);
        snapshot.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn lists_snapshots_newest_first() {
        let dir = scratch_dir();
        let daily = dir.join("daily");
        std::fs::create_dir_all(&daily).unwrap();
        std::fs::write(daily.join("xboct-log-2026-01-03.db"), b"old").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        let manual = dir.join("manual");
        std::fs::create_dir_all(&manual).unwrap();
        std::fs::write(manual.join("xboct-log-2026-01-04-030000.db"), b"new").unwrap();

        let files = list_backups(&dir);

        assert_eq!(files.len(), 2);
        assert_eq!(files[0].kind, BackupKind::Manual);
        assert_eq!(files[0].size, 3);
        assert!(files[0].mtime.ends_with('Z'));
        assert_eq!(files[1].kind, BackupKind::Daily);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn keeps_a_manual_snapshot_while_backups_are_disabled() {
        let dir = scratch_dir();
        let db = Db::open(dir.join("tasks.db")).await.unwrap();
        let mut config = BackupConfig {
            hour: 3,
            minute: 0,
            weekday: 0,
            daily_keep: 7,
            weekly_keep: 4,
            auto_keep: 48,
            auto_interval_min: 30,
            disabled: true,
        };

        let manual = run_backup(
            &db,
            &dir.join("backups"),
            &config,
            BackupKind::Manual,
            at(2026, 1, 4, 3, 0, 0),
        )
        .await
        .unwrap();
        assert!(manual.exists());

        config.disabled = false;
        let auto = run_backup(
            &db,
            &dir.join("backups"),
            &config,
            BackupKind::Auto,
            at(2026, 1, 4, 3, 0, 1),
        )
        .await
        .unwrap();
        assert!(auto.exists());

        config.disabled = true;
        let skipped = run_backup(
            &db,
            &dir.join("backups"),
            &config,
            BackupKind::Auto,
            at(2026, 1, 4, 3, 0, 2),
        )
        .await
        .unwrap();
        assert!(skipped.as_os_str().is_empty());

        db.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn prunes_the_old_names() {
        let dir = scratch_dir();
        std::fs::create_dir_all(&dir).unwrap();
        for name in ["xboct-log-3.db", "xboct-log-2.db", "xboct-log-1.db"] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        std::fs::write(dir.join("notes.txt"), b"x").unwrap();

        prune(&dir, 2);

        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(
            left,
            vec![
                "notes.txt".to_owned(),
                "xboct-log-2.db".to_owned(),
                "xboct-log-3.db".to_owned()
            ]
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn keeps_everything_when_the_limit_is_off() {
        let dir = scratch_dir();
        std::fs::create_dir_all(&dir).unwrap();
        for name in ["xboct-log-1.db", "xboct-log-2.db"] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }

        prune(&dir, 0);

        assert!(dir.join("xboct-log-1.db").exists());
        assert!(dir.join("xboct-log-2.db").exists());
        let _ = std::fs::remove_dir_all(dir);
    }
}
