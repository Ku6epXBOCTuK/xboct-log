use std::sync::Arc;

use serde_json::json;
use xboct_log_core::{ActivitySource, AppErrorKind, Config, Db, Entity, Events, OpName};
use xboct_log_ops::{Ctx, Kind, dispatch, metadata};

async fn context() -> Ctx {
    let db = Db::open(":memory:").await.unwrap();
    db.migrate().await.unwrap();
    let config =
        Config::from_lookup(|name| (name == "XBOCT_LOG_DB").then(|| ":memory:".to_string()))
            .expect("config");
    Ctx::new(Arc::new(db), Arc::new(Events::new()), Arc::new(config))
}

async fn media_context(media: &std::path::Path) -> Ctx {
    let db = Db::open(":memory:").await.unwrap();
    db.migrate().await.unwrap();
    let media = media.display().to_string();
    let config = Config::from_lookup(move |name| match name {
        "XBOCT_LOG_DB" => Some(":memory:".to_string()),
        "XBOCT_LOG_MEDIA_DIR" => Some(media.clone()),
        _ => None,
    })
    .expect("config");
    Ctx::new(Arc::new(db), Arc::new(Events::new()), Arc::new(config))
}

mod catalog;
mod commands;
mod pagination;
mod validation;
