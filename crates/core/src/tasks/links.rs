use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqliteConnection;

use crate::ids::{TaskKey, TaskUuid};
use crate::{AppError, Db, Result};

use super::model::{Change, ReleasedLink, Task};
use super::resolve::resolve_task_id;
use super::sql::get_task;
use super::write::{blocking_downstream, shifts_to_released, sync_blocking_status};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LinkType {
    Blocks,
    RelatesTo,
    Duplicates,
}

impl LinkType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Blocks => "blocks",
            Self::RelatesTo => "relates_to",
            Self::Duplicates => "duplicates",
        }
    }

    pub fn verb(self) -> &'static str {
        match self {
            Self::Blocks => "block",
            Self::RelatesTo => "relates to",
            Self::Duplicates => "duplicate",
        }
    }

    fn symmetric(self) -> bool {
        matches!(self, Self::RelatesTo)
    }
}

async fn task_uuid(conn: &mut SqliteConnection, key: &TaskKey) -> Result<Option<TaskUuid>> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT id FROM tasks WHERE key = ? AND deleted_at IS NULL")
            .bind(key.as_str())
            .fetch_optional(&mut *conn)
            .await?;
    row.map(|(id,)| TaskUuid::parse(&id)).transpose()
}

fn ordered_pair<'a>(source: &'a str, target: &'a str, link: LinkType) -> (&'a str, &'a str) {
    if link.symmetric() && target < source {
        (target, source)
    } else {
        (source, target)
    }
}

async fn has_directed_path(
    conn: &mut SqliteConnection,
    link: LinkType,
    from: &str,
    to: &str,
) -> Result<bool> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut stack = vec![from.to_string()];
    while let Some(current) = stack.pop() {
        if current == to {
            return Ok(true);
        }
        if !seen.insert(current.clone()) {
            continue;
        }
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT target_task_id FROM task_links WHERE link_type = ? AND source_task_id = ?",
        )
        .bind(link.as_str())
        .bind(&current)
        .fetch_all(&mut *conn)
        .await?;
        for (next,) in rows {
            if !seen.contains(&next) {
                stack.push(next);
            }
        }
    }
    Ok(false)
}

async fn has_link(
    conn: &mut SqliteConnection,
    link: LinkType,
    source: &str,
    target: &str,
) -> Result<bool> {
    let (source, target) = ordered_pair(source, target, link);
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM task_links WHERE source_task_id = ? AND target_task_id = ? AND link_type = ?",
    )
    .bind(source)
    .bind(target)
    .bind(link.as_str())
    .fetch_optional(&mut *conn)
    .await?;
    Ok(row.is_some())
}

async fn insert_link(
    conn: &mut SqliteConnection,
    link: LinkType,
    source: &str,
    target: &str,
) -> Result<()> {
    let (source, target) = ordered_pair(source, target, link);
    sqlx::query(
        "INSERT OR IGNORE INTO task_links (source_task_id, target_task_id, link_type, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(source)
    .bind(target)
    .bind(link.as_str())
    .bind(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn add_link(
    db: &Db,
    link: LinkType,
    source_key: &str,
    target_key: &str,
) -> Result<Vec<ReleasedLink>> {
    let source = resolve_task_id(db, source_key).await?;
    let target = resolve_task_id(db, target_key).await?;
    if source == target {
        return Err(AppError::validation(format!(
            "a task cannot {} itself",
            link.verb()
        )));
    }
    let mut tx = db.begin().await?;
    let Some(source_uuid) = task_uuid(&mut tx, &source).await? else {
        return Err(AppError::not_found(format!(
            "task {} not found",
            source.as_str()
        )));
    };
    let Some(target_uuid) = task_uuid(&mut tx, &target).await? else {
        return Err(AppError::not_found(format!(
            "task {} not found",
            target.as_str()
        )));
    };
    if !link.symmetric()
        && has_directed_path(&mut tx, link, target_uuid.as_str(), source_uuid.as_str()).await?
    {
        return Err(AppError::conflict(format!(
            "{} cycle: {} already {} {}",
            link.as_str(),
            target.as_str(),
            link.as_str(),
            source.as_str()
        )));
    }
    if has_link(&mut tx, link, source_uuid.as_str(), target_uuid.as_str()).await? {
        return Ok(Vec::new());
    }
    insert_link(&mut tx, link, source_uuid.as_str(), target_uuid.as_str()).await?;
    if link != LinkType::Blocks {
        tx.commit().await?;
        return Ok(Vec::new());
    }
    let affected = blocking_downstream(&mut tx, std::slice::from_ref(&target)).await?;
    let shifts = sync_blocking_status(&mut tx, &affected).await?;
    tx.commit().await?;
    Ok(shifts_to_released(shifts))
}

pub async fn remove_link(
    db: &Db,
    link: LinkType,
    source_key: &str,
    target_key: &str,
) -> Result<Vec<ReleasedLink>> {
    let source = resolve_task_id(db, source_key).await?;
    let target = resolve_task_id(db, target_key).await?;
    let message = || {
        AppError::not_found(format!(
            "no {} link between {} and {}",
            link.as_str(),
            source.as_str(),
            target.as_str()
        ))
    };
    let mut tx = db.begin().await?;
    let Some(source_uuid) = task_uuid(&mut tx, &source).await? else {
        return Err(message());
    };
    let Some(target_uuid) = task_uuid(&mut tx, &target).await? else {
        return Err(message());
    };
    let affected = if link == LinkType::Blocks {
        blocking_downstream(&mut tx, std::slice::from_ref(&target)).await?
    } else {
        Vec::new()
    };
    let (ordered_source, ordered_target) =
        ordered_pair(source_uuid.as_str(), target_uuid.as_str(), link);
    let result = sqlx::query(
        "DELETE FROM task_links WHERE source_task_id = ? AND target_task_id = ? AND link_type = ?",
    )
    .bind(ordered_source)
    .bind(ordered_target)
    .bind(link.as_str())
    .execute(&mut *tx)
    .await?;
    if result.rows_affected() == 0 {
        return Err(message());
    }
    if link != LinkType::Blocks {
        tx.commit().await?;
        return Ok(Vec::new());
    }
    let shifts = sync_blocking_status(&mut tx, &affected).await?;
    tx.commit().await?;
    Ok(shifts_to_released(shifts))
}

pub async fn add_blocker(
    db: &Db,
    blocked_key: &str,
    blocker_key: &str,
) -> Result<Vec<ReleasedLink>> {
    add_link(db, LinkType::Blocks, blocker_key, blocked_key).await
}

pub async fn remove_blocker(
    db: &Db,
    blocked_key: &str,
    blocker_key: &str,
) -> Result<Vec<ReleasedLink>> {
    remove_link(db, LinkType::Blocks, blocker_key, blocked_key).await
}

pub fn link_changes(before: &Task, after: &Task, field: &str) -> Vec<Change> {
    let (from, to) = match field {
        "relates_to" => (json!(before.relates_to), json!(after.relates_to)),
        "duplicates" => (json!(before.duplicates), json!(after.duplicates)),
        _ => (json!(before.blocked_by), json!(after.blocked_by)),
    };
    let mut changes = Vec::new();
    if from != to {
        changes.push(Change {
            field: field.to_string(),
            from,
            to,
        });
    }
    if before.status != after.status {
        changes.push(Change {
            field: "status".to_string(),
            from: json!(before.status),
            to: json!(after.status),
        });
    }
    changes
}

pub async fn link_task(db: &Db, key: &TaskKey) -> Result<Task> {
    get_task(db, key.as_str()).await
}
