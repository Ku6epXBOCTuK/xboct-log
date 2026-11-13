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
                if raw != normalized && is_placeholder(normalized) {
                    self.0.insert(normalized.clone(), raw.clone());
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

fn is_placeholder(value: &str) -> bool {
    value.starts_with('<') && value.ends_with('>') && value.len() > 2
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
        let mut normalizer =
            Normalizer::new(self.now_ms, Some(runtime_text.as_str()), HashMap::new());
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
