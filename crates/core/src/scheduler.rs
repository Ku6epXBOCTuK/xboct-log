use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Datelike, Local, TimeZone};
use tracing::{info, warn};

use crate::backup::{file_name, run_backup};
use crate::{BackupConfig, BackupKind, Db, Result};

pub fn scheduled_for(config: &BackupConfig, now: DateTime<Local>) -> DateTime<Local> {
    let naive = now.date_naive().and_hms_opt(0, 0, 0);
    let midnight = naive.and_then(|naive| Local.from_local_datetime(&naive).earliest());
    let Some(midnight) = midnight else {
        return now;
    };
    midnight + chrono::Duration::hours(config.hour) + chrono::Duration::minutes(config.minute)
}

pub fn ms_until_next(config: &BackupConfig, now: DateTime<Local>) -> u64 {
    let next = scheduled_for(config, now);
    let next = if next <= now {
        next + chrono::Duration::days(1)
    } else {
        next
    };
    u64::try_from((next - now).num_milliseconds()).unwrap_or(0)
}

fn is_weekly_day(config: &BackupConfig, now: DateTime<Local>) -> bool {
    config.weekday == i64::from(now.weekday().num_days_from_sunday())
}

pub async fn run_scheduled(
    db: &Db,
    dir: &Path,
    config: &BackupConfig,
    now: DateTime<Local>,
) -> Result<Vec<PathBuf>> {
    let mut saved = Vec::new();
    let daily = run_backup(db, dir, config, BackupKind::Daily, now).await?;
    if !daily.as_os_str().is_empty() {
        saved.push(daily);
    }
    if is_weekly_day(config, now) {
        let weekly = run_backup(db, dir, config, BackupKind::Weekly, now).await?;
        if !weekly.as_os_str().is_empty() {
            saved.push(weekly);
        }
    }
    Ok(saved)
}

pub async fn catch_up(
    db: &Db,
    dir: &Path,
    config: &BackupConfig,
    now: DateTime<Local>,
) -> Result<Vec<PathBuf>> {
    if config.disabled || now < scheduled_for(config, now) {
        return Ok(Vec::new());
    }

    let mut saved = Vec::new();
    let daily = dir
        .join(BackupKind::Daily.directory())
        .join(file_name(BackupKind::Daily, now));
    if !daily.exists() {
        let path = run_backup(db, dir, config, BackupKind::Daily, now).await?;
        if !path.as_os_str().is_empty() {
            saved.push(path);
        }
    }

    if is_weekly_day(config, now) {
        let weekly = dir
            .join(BackupKind::Weekly.directory())
            .join(file_name(BackupKind::Weekly, now));
        if !weekly.exists() {
            let path = run_backup(db, dir, config, BackupKind::Weekly, now).await?;
            if !path.as_os_str().is_empty() {
                saved.push(path);
            }
        }
    }
    Ok(saved)
}

pub fn start(db: Arc<Db>, dir: PathBuf, config: BackupConfig) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        match catch_up(&db, &dir, &config, Local::now()).await {
            Ok(saved) if !saved.is_empty() => {
                info!(files = ?saved, "catch-up backups");
            }
            Ok(_) => {}
            Err(error) => warn!(%error, "catch-up backups failed"),
        }

        loop {
            let wait = ms_until_next(&config, Local::now());
            tokio::time::sleep(Duration::from_millis(wait)).await;
            match run_scheduled(&db, &dir, &config, Local::now()).await {
                Ok(saved) if !saved.is_empty() => info!(files = ?saved, "scheduled backups"),
                Ok(_) => {}
                Err(error) => warn!(%error, "scheduled backups failed"),
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(day: u32, hour: u32, minute: u32) -> DateTime<Local> {
        Local
            .with_ymd_and_hms(2026, 1, day, hour, minute, 0)
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
        xboct_log_test_support::scratch_dir("scheduler")
    }

    #[test]
    fn schedules_the_local_wall_clock_time() {
        let now = at(4, 1, 30);
        assert_eq!(scheduled_for(&config(), now), at(4, 3, 0));
    }

    #[test]
    fn waits_for_tomorrow_once_the_time_has_passed() {
        let now = at(4, 4, 0);
        let wait = ms_until_next(&config(), now);
        assert_eq!(wait, 23 * 60 * 60 * 1000);
    }

    #[tokio::test]
    async fn writes_daily_and_weekly_snapshots() {
        let dir = scratch_dir();
        let db = Db::open(dir.join("tasks.db")).await.unwrap();

        let sunday = run_scheduled(&db, &dir.join("backups"), &config(), at(4, 3, 0))
            .await
            .unwrap();
        assert_eq!(sunday.len(), 2);
        assert!(sunday[0].ends_with("daily/xboct-log-2026-01-04.db"));
        assert!(sunday[1].ends_with("weekly/xboct-log-2026-W01.db"));

        let monday = run_scheduled(&db, &dir.join("backups"), &config(), at(5, 3, 0))
            .await
            .unwrap();
        assert_eq!(monday.len(), 1);

        db.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn catches_up_only_after_the_scheduled_time() {
        let dir = scratch_dir();
        let db = Db::open(dir.join("tasks.db")).await.unwrap();
        let backups = dir.join("backups");

        let early = catch_up(&db, &backups, &config(), at(4, 2, 0))
            .await
            .unwrap();
        assert!(early.is_empty());

        let late = catch_up(&db, &backups, &config(), at(4, 10, 0))
            .await
            .unwrap();
        assert_eq!(late.len(), 2);

        let again = catch_up(&db, &backups, &config(), at(4, 11, 0))
            .await
            .unwrap();
        assert!(again.is_empty());

        db.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn does_nothing_while_backups_are_disabled() {
        let dir = scratch_dir();
        let db = Db::open(dir.join("tasks.db")).await.unwrap();
        let mut config = config();
        config.disabled = true;

        let saved = catch_up(&db, &dir.join("backups"), &config, at(4, 10, 0))
            .await
            .unwrap();
        assert!(saved.is_empty());

        db.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }
}
