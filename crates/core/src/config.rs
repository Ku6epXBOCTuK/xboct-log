use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub db_path: PathBuf,
    pub media_dir: PathBuf,
    pub backup_dir: PathBuf,
    pub web_dir: PathBuf,
    pub backup: BackupConfig,
    pub activity_keep_days: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackupConfig {
    pub hour: i64,
    pub minute: i64,
    pub weekday: i64,
    pub daily_keep: i64,
    pub weekly_keep: i64,
    pub auto_keep: i64,
    pub auto_interval_min: i64,
    pub disabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ConfigError {
    #[error(
        "XBOCT_LOG_DB is not set. Start the app through the xboct-log launcher, or pass --data <dir>."
    )]
    MissingDatabasePath,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let read = |name: &str| lookup(name).filter(|value| !value.is_empty());
        let db_path = read("XBOCT_LOG_DB").ok_or(ConfigError::MissingDatabasePath)?;

        Ok(Self {
            db_path: db_path.into(),
            media_dir: read("XBOCT_LOG_MEDIA_DIR").unwrap_or_default().into(),
            backup_dir: read("XBOCT_LOG_BACKUP_DIR").unwrap_or_default().into(),
            web_dir: read("XBOCT_LOG_WEB_DIR").unwrap_or_default().into(),
            backup: BackupConfig {
                hour: backup_number(&read, "XBOCT_LOG_BACKUP_HOUR", 3),
                minute: backup_number(&read, "XBOCT_LOG_BACKUP_MINUTE", 0),
                weekday: backup_number(&read, "XBOCT_LOG_BACKUP_WEEKDAY", 0),
                daily_keep: backup_number(&read, "XBOCT_LOG_BACKUP_DAILY_KEEP", 7),
                weekly_keep: backup_number(&read, "XBOCT_LOG_BACKUP_WEEKLY_KEEP", 4),
                auto_keep: backup_number(&read, "XBOCT_LOG_BACKUP_AUTO_KEEP", 48),
                auto_interval_min: backup_number(&read, "XBOCT_LOG_BACKUP_AUTO_INTERVAL_MIN", 30),
                disabled: read("XBOCT_LOG_BACKUP_DISABLED")
                    .is_some_and(|value| value != "0" && !value.eq_ignore_ascii_case("false")),
            },
            activity_keep_days: activity_keep_days(&read),
        })
    }

    pub fn resolved_media_dir(&self) -> PathBuf {
        if self.media_dir.as_os_str().is_empty() {
            self.db_path
                .parent()
                .filter(|parent| !parent.as_os_str().is_empty())
                .unwrap_or_else(|| Path::new(""))
                .join("media")
        } else {
            self.media_dir.clone()
        }
    }
}

fn backup_number(lookup: &impl Fn(&str) -> Option<String>, name: &str, fallback: i64) -> i64 {
    lookup(name)
        .and_then(|value| parse_number(&value))
        .unwrap_or(fallback)
}

fn activity_keep_days(lookup: &impl Fn(&str) -> Option<String>) -> i64 {
    let days = lookup("XBOCT_LOG_ACTIVITY_KEEP_DAYS")
        .and_then(|value| parse_int(&value))
        .unwrap_or(365);
    if days > 0 { days } else { 365 }
}

fn parse_int(value: &str) -> Option<i64> {
    let text = value.trim_start();
    let (sign, digits) = match text.as_bytes().first() {
        Some(b'-') => (-1, &text[1..]),
        Some(b'+') => (1, &text[1..]),
        _ => (1, text),
    };
    let end = digits
        .find(|character: char| !character.is_ascii_digit())
        .unwrap_or(digits.len());
    if end == 0 {
        return None;
    }
    digits[..end].parse::<i64>().ok().map(|value| value * sign)
}

fn parse_number(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Some(0);
    }
    let parsed = trimmed
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())?;
    if parsed.abs() > i64::MAX as f64 {
        return None;
    }
    Some(parsed.trunc() as i64)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn lookup(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let pairs: HashMap<String, String> = pairs
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect();
        move |name| pairs.get(name).cloned()
    }

    #[test]
    fn requires_the_database_path() {
        let error = Config::from_lookup(lookup(&[])).unwrap_err();
        assert_eq!(error, ConfigError::MissingDatabasePath);
    }

    #[test]
    fn applies_the_documented_defaults() {
        let config = Config::from_lookup(lookup(&[("XBOCT_LOG_DB", "tasks.db")])).unwrap();

        assert_eq!(config.db_path, PathBuf::from("tasks.db"));
        assert_eq!(config.media_dir, PathBuf::new());
        assert_eq!(config.backup_dir, PathBuf::new());
        assert_eq!(
            config.backup,
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
        );
        assert_eq!(config.activity_keep_days, 365);
    }

    #[test]
    fn reads_the_environment() {
        let config = Config::from_lookup(lookup(&[
            ("XBOCT_LOG_DB", "C:/data/tasks.db"),
            ("XBOCT_LOG_MEDIA_DIR", "C:/data/media"),
            ("XBOCT_LOG_BACKUP_DIR", "C:/data/backups"),
            ("XBOCT_LOG_BACKUP_HOUR", "5"),
            ("XBOCT_LOG_BACKUP_MINUTE", "15"),
            ("XBOCT_LOG_BACKUP_WEEKDAY", "1"),
            ("XBOCT_LOG_BACKUP_DAILY_KEEP", "10"),
            ("XBOCT_LOG_BACKUP_WEEKLY_KEEP", "6"),
            ("XBOCT_LOG_BACKUP_AUTO_KEEP", "12"),
            ("XBOCT_LOG_BACKUP_AUTO_INTERVAL_MIN", "45"),
            ("XBOCT_LOG_BACKUP_DISABLED", "yes"),
            ("XBOCT_LOG_ACTIVITY_KEEP_DAYS", "30"),
        ]))
        .unwrap();

        assert_eq!(config.media_dir, PathBuf::from("C:/data/media"));
        assert_eq!(config.backup_dir, PathBuf::from("C:/data/backups"));
        assert_eq!(config.backup.hour, 5);
        assert_eq!(config.backup.minute, 15);
        assert_eq!(config.backup.weekday, 1);
        assert_eq!(config.backup.daily_keep, 10);
        assert_eq!(config.backup.weekly_keep, 6);
        assert_eq!(config.backup.auto_keep, 12);
        assert_eq!(config.backup.auto_interval_min, 45);
        assert!(config.backup.disabled);
        assert_eq!(config.activity_keep_days, 30);
    }

    #[test]
    fn treats_an_empty_path_as_absent() {
        let config = Config::from_lookup(lookup(&[
            ("XBOCT_LOG_DB", "tasks.db"),
            ("XBOCT_LOG_MEDIA_DIR", ""),
        ]))
        .unwrap();

        assert_eq!(config.media_dir, PathBuf::new());
    }

    #[test]
    fn rejects_a_broken_backup_number() {
        let config = Config::from_lookup(lookup(&[
            ("XBOCT_LOG_DB", "tasks.db"),
            ("XBOCT_LOG_BACKUP_HOUR", "5abc"),
        ]))
        .unwrap();

        assert_eq!(config.backup.hour, 3);
    }

    #[test]
    fn accepts_a_leading_number_for_activity_days() {
        let config = Config::from_lookup(lookup(&[
            ("XBOCT_LOG_DB", "tasks.db"),
            ("XBOCT_LOG_ACTIVITY_KEEP_DAYS", "30 days"),
        ]))
        .unwrap();

        assert_eq!(config.activity_keep_days, 30);
    }

    #[test]
    fn replaces_a_non_positive_activity_window() {
        for value in ["0", "-5", "never"] {
            let config = Config::from_lookup(lookup(&[
                ("XBOCT_LOG_DB", "tasks.db"),
                ("XBOCT_LOG_ACTIVITY_KEEP_DAYS", value),
            ]))
            .unwrap();

            assert_eq!(config.activity_keep_days, 365);
        }
    }

    #[test]
    fn reads_the_backup_flag_like_the_node_parser() {
        for (value, expected) in [
            ("1", true),
            ("true", true),
            ("yes", true),
            ("TRUE", true),
            ("on", true),
            ("0", false),
            ("false", false),
            ("FALSE", false),
        ] {
            let config = Config::from_lookup(lookup(&[
                ("XBOCT_LOG_DB", "tasks.db"),
                ("XBOCT_LOG_BACKUP_DISABLED", value),
            ]))
            .unwrap();

            assert_eq!(config.backup.disabled, expected, "{value}");
        }
    }
}
