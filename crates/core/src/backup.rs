use std::path::{Path, PathBuf};

use chrono::{DateTime, Datelike, Local, Timelike};

use crate::{AppError, BackupConfig, Db, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

    let target_text = target.to_string_lossy().into_owned();
    sqlx::query("VACUUM INTO ?")
        .bind(target_text)
        .execute(db.pool())
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;

    if let Some(keep) = kind.keep(config) {
        prune(&target_dir, keep);
    }
    Ok(target)
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
        std::env::temp_dir().join(format!(
            "xboct-log-backup-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
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
