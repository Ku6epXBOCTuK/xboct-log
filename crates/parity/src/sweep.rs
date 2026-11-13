use std::{collections::HashMap, sync::Arc};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use xboct_log_core::{Config, Db, Events, Result};
use xboct_log_ops::{Ctx, Kind, dispatch, metadata};

use crate::diff::difference;
use crate::normalize::Normalizer;

#[derive(Default)]
struct Placeholders(HashMap<String, String>);

impl Placeholders {
    fn learn(&mut self, raw: &Value, normalized: &Value) {
        match (raw, normalized) {
            (Value::String(raw), Value::String(normalized)) => {
                if raw != normalized {
                    self.learn_text(raw, normalized);
                }
            }
            (Value::Array(raw), Value::Array(normalized)) => {
                for (raw, normalized) in raw.iter().zip(normalized) {
                    self.learn(raw, normalized);
                }
            }
            (Value::Object(raw), Value::Object(normalized)) => {
                for (key, raw) in raw {
                    if let Some(normalized) = normalized.get(key) {
                        self.learn(raw, normalized);
                    }
                }
            }
            _ => {}
        }
    }

    fn learn_text(&mut self, raw: &str, normalized: &str) {
        let parts = split_placeholders(normalized);
        if parts.len() < 2 {
            return;
        }
        let mut cursor = 0;
        let mut learned: Vec<(String, String)> = Vec::new();
        for (index, part) in parts.iter().enumerate() {
            if index % 2 == 0 {
                let Some(end) = match_text(raw, cursor, part) else {
                    return;
                };
                cursor = end;
                continue;
            }
            let end = if parts[index + 1].is_empty() {
                raw.len()
            } else {
                match find_text(raw, cursor, parts[index + 1]) {
                    Some(start) => start,
                    None => return,
                }
            };
            if end <= cursor {
                return;
            }
            learned.push((format!("<{part}>"), raw[cursor..end].to_string()));
            cursor = end;
        }
        if cursor != raw.len() || learned.is_empty() {
            return;
        }
        for (placeholder, value) in learned {
            self.0.entry(placeholder).or_insert(value);
        }
    }

    fn resolve(&self, value: &Value) -> Value {
        match value {
            Value::String(text) => Value::String(self.text(text)),
            Value::Array(items) => {
                Value::Array(items.iter().map(|item| self.resolve(item)).collect())
            }
            Value::Object(map) => Value::Object(
                map.iter()
                    .map(|(key, value)| (key.clone(), self.resolve(value)))
                    .collect::<Map<String, Value>>(),
            ),
            other => other.clone(),
        }
    }

    fn text(&self, text: &str) -> String {
        let mut known: Vec<(&String, &String)> = self.0.iter().collect();
        known.sort_by_key(|(placeholder, _)| std::cmp::Reverse(placeholder.len()));
        let mut resolved = text.to_owned();
        for (placeholder, value) in known {
            resolved = resolved.replace(placeholder.as_str(), value);
        }
        resolved
    }
}

fn match_text(raw: &str, cursor: usize, text: &str) -> Option<usize> {
    let mut end = cursor;
    let mut chars = raw[cursor..].char_indices();
    for expected in text.chars() {
        let (offset, actual) = chars.next()?;
        if actual != expected && !(is_separator(actual) && is_separator(expected)) {
            return None;
        }
        end = cursor + offset + actual.len_utf8();
    }
    Some(end)
}

fn find_text(raw: &str, cursor: usize, text: &str) -> Option<usize> {
    raw[cursor..]
        .char_indices()
        .map(|(offset, _)| cursor + offset)
        .find(|start| match_text(raw, *start, text).is_some())
}

fn is_separator(value: char) -> bool {
    value == '/' || value == '\\'
}

fn split_placeholders(value: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut cursor = 0;
    while let Some(start) = value[cursor..].find('<').map(|offset| cursor + offset) {
        let Some(length) = value[start..].find('>') else {
            break;
        };
        parts.push(&value[cursor..start]);
        parts.push(&value[start + 1..start + length]);
        cursor = start + length + 1;
    }
    parts.push(&value[cursor..]);
    parts
}

#[derive(Debug, Deserialize)]
pub struct Call {
    pub name: String,
    pub kind: Kind,
    pub mcp: bool,
    pub input: Value,
    pub output: Value,
}

#[derive(Debug, Deserialize)]
pub struct Calls {
    pub calls: Vec<Call>,
}

#[derive(Debug, Serialize)]
pub struct Replayed {
    pub name: String,
    pub kind: Kind,
    pub mcp: bool,
    pub input: Value,
    pub output: Value,
}

#[derive(Debug, Serialize)]
pub struct ReplayedCalls {
    pub calls: Vec<Replayed>,
}

pub struct Sweep {
    pub runtime: std::path::PathBuf,
    pub database: std::path::PathBuf,
    pub now_ms: i64,
}

impl Sweep {
    pub async fn run(&self, calls: &Calls) -> Result<(ReplayedCalls, Vec<String>)> {
        let config = Arc::new(
            Config::from_lookup(|name| match name {
                "XBOCT_LOG_DB" => Some(self.database.display().to_string()),
                "XBOCT_LOG_MEDIA_DIR" => Some(self.runtime.join("media").display().to_string()),
                "XBOCT_LOG_BACKUP_DIR" => Some(self.runtime.join("backups").display().to_string()),
                "XBOCT_LOG_BACKUP_DISABLED" => Some("1".to_owned()),
                _ => None,
            })
            .map_err(|error| xboct_log_core::AppError::unexpected(error.to_string()))?,
        );
        let db = Arc::new(Db::open(&config.db_path).await?);
        let ctx = Ctx::new(db, Arc::new(Events::new()), config);

        let runtime_text = self.runtime.to_string_lossy().into_owned();
        let identity_rows = crate::snapshot::read_identity_rows(&self.database)
            .await
            .unwrap_or_default();
        let identities = crate::normalize::identities_of(&identity_rows);
        let mut normalizer = Normalizer::new(self.now_ms, Some(runtime_text.as_str()), identities);
        let known = metadata();
        let mut replayed = Vec::with_capacity(calls.calls.len());
        let mut lines = Vec::new();
        let mut placeholders = Placeholders::default();

        for (index, call) in calls.calls.iter().enumerate() {
            let name = call.name.split('#').next().unwrap_or(&call.name);
            if !known.iter().any(|op| op.name == name) {
                break;
            }
            let input = placeholders.resolve(&call.input);
            let output = dispatch(&ctx, name, input.clone()).await;
            let output = match output {
                Ok(value) => {
                    let normalized = normalizer.normalize(&value);
                    placeholders.learn(&value, &normalized);
                    normalized
                }
                Err(error) => {
                    lines.push(format!(
                        "call {index} {}: {:?} {}",
                        call.name,
                        error.kind(),
                        error.message()
                    ));
                    break;
                }
            };
            if let Some(path) = difference(&call.output, &output) {
                lines.push(format!("call {index} {}: {path}", call.name));
            }
            replayed.push(Replayed {
                name: call.name.clone(),
                kind: call.kind,
                mcp: call.mcp,
                input,
                output,
            });
        }

        Ok((ReplayedCalls { calls: replayed }, lines))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn learns_a_stamp_from_a_windows_path() {
        let mut placeholders = Placeholders::default();
        placeholders.learn(
            &json!("C:\\run\\backups\\manual\\xboct-log-2026-11-13-144556.db"),
            &json!("<runtime>/backups/manual/xboct-log-<stamp>.db"),
        );
        assert_eq!(
            placeholders.text("xboct-log-<stamp>.db"),
            "xboct-log-2026-11-13-144556.db"
        );
        assert_eq!(
            placeholders.text("<runtime>/backups/manual/x.db"),
            "C:\\run/backups/manual/x.db"
        );
    }
}
