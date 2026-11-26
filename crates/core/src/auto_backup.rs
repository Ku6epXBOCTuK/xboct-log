use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::time::UNIX_EPOCH;

use chrono::{DateTime, Local};

use crate::{BackupConfig, BackupKind, Db, Result, backup::run_backup};

const MINUTE_MS: i64 = 60_000;

#[derive(Debug, Default)]
pub struct AutoBackup {
    last_at: AtomicI64,
    running: AtomicBool,
}

impl AutoBackup {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&self) {
        self.last_at.store(0, Ordering::SeqCst);
        self.running.store(false, Ordering::SeqCst);
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

struct RunningGuard<'a>(&'a AtomicBool);

impl Drop for RunningGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

pub fn newest_auto_snapshot_at(dir: &Path) -> i64 {
    let Ok(entries) = std::fs::read_dir(dir.join(BackupKind::Auto.directory())) else {
        return 0;
    };
    let mut newest = 0;
    for entry in entries.filter_map(|entry| entry.ok()) {
        if !entry.file_name().to_string_lossy().ends_with(".db") {
            continue;
        }
        let Ok(modified) = entry.metadata().and_then(|metadata| metadata.modified()) else {
            continue;
        };
        let Ok(since_epoch) = modified.duration_since(UNIX_EPOCH) else {
            continue;
        };
        newest = newest.max(i64::try_from(since_epoch.as_millis()).unwrap_or(i64::MAX));
    }
    newest
}

pub async fn maybe_auto_backup(
    db: &Db,
    dir: &Path,
    config: &BackupConfig,
    state: &AutoBackup,
    now: DateTime<Local>,
) -> Result<Option<PathBuf>> {
    if config.disabled {
        return Ok(None);
    }
    if state.running.swap(true, Ordering::SeqCst) {
        return Ok(None);
    }
    let _guard = RunningGuard(&state.running);

    let interval = config.auto_interval_min.max(1) * MINUTE_MS;
    let last = state
        .last_at
        .load(Ordering::SeqCst)
        .max(newest_auto_snapshot_at(dir));
    if now.timestamp_millis() - last < interval {
        return Ok(None);
    }

    let result = run_backup(db, dir, config, BackupKind::Auto, now).await;
    state
        .last_at
        .store(now.timestamp_millis(), Ordering::SeqCst);
    result.map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(hour: u32, minute: u32, second: u32) -> DateTime<Local> {
        Local
            .with_ymd_and_hms(2026, 1, 4, hour, minute, second)
            .single()
            .unwrap()
    }

    fn config() -> BackupConfig {
        BackupConfig {
            hour: 3,
            minute: 0,
            weekday: 0,
            daily_keep: 7,
            weekly_keep: 4,
            auto_keep: 48,
            auto_interval_min: 30,
            disabled: false,
        }
    }

    fn scratch_dir() -> PathBuf {
        xboct_log_test_support::scratch_dir("auto")
    }

    #[tokio::test]
    async fn writes_once_per_interval() {
        let dir = scratch_dir();
        let backups = dir.join("backups");
        let db = Db::open(dir.join("tasks.db")).await.unwrap();
        let state = AutoBackup::new();

        let start = Local::now();
        let first = maybe_auto_backup(&db, &backups, &config(), &state, start)
            .await
            .unwrap();
        assert!(first.is_some_and(|path| path.exists()));

        let second = maybe_auto_backup(
            &db,
            &backups,
            &config(),
            &state,
            start + chrono::Duration::minutes(10),
        )
        .await
        .unwrap();
        assert!(second.is_none());

        let third = maybe_auto_backup(
            &db,
            &backups,
            &config(),
            &state,
            start + chrono::Duration::minutes(31),
        )
        .await
        .unwrap();
        assert!(third.is_some());

        db.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn respects_a_snapshot_left_by_another_process() {
        let dir = scratch_dir();
        let backups = dir.join("backups");
        let auto = backups.join("auto");
        std::fs::create_dir_all(&auto).unwrap();
        std::fs::write(auto.join("xboct-log-2026-01-04-030000.db"), b"x").unwrap();
        let db = Db::open(dir.join("tasks.db")).await.unwrap();
        let state = AutoBackup::new();

        let path = maybe_auto_backup(&db, &backups, &config(), &state, at(3, 10, 0))
            .await
            .unwrap();
        assert!(path.is_none());

        db.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn skips_while_disabled_or_running() {
        let dir = scratch_dir();
        let backups = dir.join("backups");
        let db = Db::open(dir.join("tasks.db")).await.unwrap();
        let state = AutoBackup::new();

        let mut disabled = config();
        disabled.disabled = true;
        let skipped = maybe_auto_backup(&db, &backups, &disabled, &state, at(3, 0, 0))
            .await
            .unwrap();
        assert!(skipped.is_none());

        state.running.store(true, Ordering::SeqCst);
        let busy = maybe_auto_backup(&db, &backups, &config(), &state, at(3, 0, 0))
            .await
            .unwrap();
        assert!(busy.is_none());
        assert!(state.is_running());

        db.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn reports_the_newest_snapshot() {
        let dir = scratch_dir();
        let auto = dir.join("auto");
        std::fs::create_dir_all(&auto).unwrap();
        assert_eq!(newest_auto_snapshot_at(&dir), 0);

        std::fs::write(auto.join("xboct-log-1.db"), b"x").unwrap();
        assert!(newest_auto_snapshot_at(&dir) > 0);

        let _ = std::fs::remove_dir_all(dir);
    }
}
