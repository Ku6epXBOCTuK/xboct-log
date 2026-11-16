use std::{
    net::SocketAddr,
    path::{Path, PathBuf},
    time::Duration,
};

use chrono::{SecondsFormat, Utc};
use xboct_log_core::{list_backups, restore_snapshot_offline};

use crate::{
    args::{APP_NAME, Restore, RestoreAction},
    instance::Instance,
};

const PROBE_TIMEOUT: Duration = Duration::from_secs(1);

pub async fn run(options: Restore) -> Result<(), String> {
    let data_dir = match &options.data {
        Some(dir) => Some(absolute(dir)?),
        None => None,
    };
    let backups = match options
        .backups
        .or_else(|| data_dir.as_ref().map(|dir| dir.join("backups")))
    {
        Some(dir) => absolute(&dir)?,
        None => return Err("--data <dir> or --backups <dir> is required".to_string()),
    };

    match options.action {
        RestoreAction::List => {
            list(&backups);
            Ok(())
        }
        RestoreAction::Apply { source } => {
            let db = match options.db.or_else(|| {
                data_dir
                    .as_ref()
                    .map(|dir| dir.join(format!("{APP_NAME}.db")))
            }) {
                Some(path) => absolute(&path)?,
                None => return Err("--data <dir> or --db <path> is required".to_string()),
            };
            let port = options.port.or_else(|| {
                data_dir
                    .as_ref()
                    .and_then(|dir| Instance::read(&dir.join("instance.json")))
                    .map(|instance| instance.port)
            });
            apply(&source, &db, &backups, port).await
        }
    }
}

fn absolute(path: &Path) -> Result<PathBuf, String> {
    std::path::absolute(path).map_err(|error| format!("{}: {error}", path.display()))
}

fn list(backup_dir: &Path) {
    let files = list_backups(backup_dir);
    if files.is_empty() {
        println!("no backups in {}", backup_dir.display());
        return;
    }
    for file in files {
        println!(
            "{}  {:<6}  {:>8}  {}",
            file.mtime,
            file.kind.directory(),
            file.size,
            file.path.display()
        );
    }
}

async fn apply(
    source: &Path,
    db: &Path,
    backup_dir: &Path,
    port: Option<u16>,
) -> Result<(), String> {
    let source = absolute(source)?;
    if !source.is_file() {
        return Err(format!("backup not found: {}", source.display()));
    }
    if let Some(port) = port
        && listening(port).await
    {
        return Err(format!(
            "the server is still listening on port {port}. Stop it first."
        ));
    }
    let metadata = std::fs::metadata(&source)
        .map_err(|error| format!("cannot read {}: {error}", source.display()))?;

    let outcome = restore_snapshot_offline(&source, db, backup_dir, chrono::Local::now())
        .await
        .map_err(|error| error.to_string())?;

    if !outcome.safety_path.is_empty() {
        println!("current database saved to {}", outcome.safety_path);
    }
    println!("restored {} -> {}", source.display(), db.display());
    println!("snapshot date: {}", modified_at(&metadata));
    println!("snapshot size: {} bytes", metadata.len());
    println!(
        "projects: {}  tasks: {}",
        outcome.snapshot.projects, outcome.snapshot.tasks
    );
    println!("start the server again when the data folder is in place");
    Ok(())
}

fn modified_at(metadata: &std::fs::Metadata) -> String {
    let time: chrono::DateTime<Utc> = match metadata.modified() {
        Ok(modified) => modified.into(),
        Err(_) => return "unknown".to_string(),
    };
    time.to_rfc3339_opts(SecondsFormat::Millis, true)
}

async fn listening(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    matches!(
        tokio::time::timeout(PROBE_TIMEOUT, tokio::net::TcpStream::connect(address)).await,
        Ok(Ok(_))
    )
}
