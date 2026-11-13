use std::{collections::HashMap, sync::Arc};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use xboct_log_core::{Config, Db, Events, Result};
use xboct_log_ops::{Ctx, Kind, dispatch, metadata};

use crate::diff::difference;
use crate::normalize::Normalizer;

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

        for (index, call) in calls.calls.iter().enumerate() {
            if !known.iter().any(|op| op.name == call.name) {
                break;
            }
            let output = dispatch(&ctx, &call.name, call.input.clone()).await;
            let output = match output {
                Ok(value) => normalizer.normalize(&value),
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
                input: call.input.clone(),
                output,
            });
        }

        Ok((ReplayedCalls { calls: replayed }, lines))
    }
}
