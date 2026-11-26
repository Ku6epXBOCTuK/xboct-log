use super::*;

pub(crate) async fn auto_close_epic(db: &Db, child: &TaskKey, now: &str) -> Result<Option<Task>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT epic.key FROM tasks child JOIN tasks epic ON epic.id = child.epic_id WHERE child.key = ?",
    )
    .bind(child.as_str())
    .fetch_optional(db.pool())
    .await?;
    let Some((epic_key,)) = row else {
        return Ok(None);
    };
    let epic = read_task(db, &TaskKey::from(epic_key)).await?;
    if epic.status == Status::Blocked || matches!(epic.status, Status::Done | Status::Cancelled) {
        return Ok(None);
    }
    let counts = count_epic_children_by_status(db, epic.id.as_str()).await?;
    let total = counts.get("total").copied().unwrap_or(0);
    let done = counts.get("done").copied().unwrap_or(0);
    let cancelled = counts.get("cancelled").copied().unwrap_or(0);
    if total == 0 || total > done + cancelled {
        return Ok(None);
    }
    sqlx::query(
        "UPDATE tasks SET status = 'done', closed_at = ?, closed_reason = 'fixed', auto_closed = 1, updated_at = ? WHERE key = ?",
    )
    .bind(now)
    .bind(now)
    .bind(epic.id.as_str())
    .execute(db.pool())
    .await?;
    Ok(Some(read_task(db, &epic.id).await?))
}

pub(crate) async fn reopen_auto_closed_epic(
    db: &Db,
    child: &TaskKey,
    now: &str,
) -> Result<Option<Task>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT epic.key FROM tasks child JOIN tasks epic ON epic.id = child.epic_id WHERE child.key = ? AND epic.auto_closed = 1",
    )
    .bind(child.as_str())
    .fetch_optional(db.pool())
    .await?;
    let Some((epic_key,)) = row else {
        return Ok(None);
    };
    sqlx::query(
        "UPDATE tasks SET status = 'open', closed_at = NULL, closed_reason = NULL, auto_closed = 0, updated_at = ? WHERE key = ?",
    )
    .bind(now)
    .bind(&epic_key)
    .execute(db.pool())
    .await?;
    Ok(Some(read_task(db, &TaskKey::from(epic_key)).await?))
}

pub(crate) fn is_restorable_status(status: Status) -> bool {
    matches!(status, Status::Backlog | Status::Open | Status::InProgress)
}

pub(crate) async fn list_open_blocked_by(
    conn: &mut SqliteConnection,
    key: &str,
) -> Result<Vec<TaskKey>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT tasks.key FROM task_links l JOIN tasks ON tasks.id = l.source_task_id WHERE l.link_type = 'blocks' AND l.target_task_id = (SELECT id FROM tasks target WHERE target.key = ?) AND tasks.deleted_at IS NULL AND tasks.status NOT IN ('done', 'cancelled') ORDER BY tasks.key",
    )
    .bind(key)
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows.into_iter().map(|(key,)| TaskKey::from(key)).collect())
}

pub(crate) async fn has_open_blocked_by(conn: &mut SqliteConnection, key: &str) -> Result<bool> {
    Ok(!list_open_blocked_by(conn, key).await?.is_empty())
}

#[derive(Debug, Clone)]
pub(crate) struct StatusShift {
    pub task_id: TaskKey,
    pub from: Status,
    pub to: Status,
}

pub(crate) fn shifts_to_released(shifts: Vec<StatusShift>) -> Vec<ReleasedLink> {
    shifts
        .into_iter()
        .map(|shift| ReleasedLink {
            task_id: shift.task_id,
            changes: vec![change("status", json!(shift.from), json!(shift.to))],
        })
        .collect()
}

pub(crate) async fn blocking_downstream(
    conn: &mut SqliteConnection,
    roots: &[TaskKey],
) -> Result<Vec<TaskKey>> {
    let mut seen: HashSet<TaskKey> = HashSet::new();
    let mut queue: VecDeque<TaskKey> = VecDeque::new();
    for key in roots {
        if seen.insert(key.clone()) {
            queue.push_back(key.clone());
        }
    }
    let mut ordered = Vec::new();
    while let Some(current) = queue.pop_front() {
        ordered.push(current.clone());
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT target.key FROM task_links l JOIN tasks target ON target.id = l.target_task_id WHERE l.link_type = 'blocks' AND l.source_task_id = (SELECT id FROM tasks WHERE key = ?) AND target.deleted_at IS NULL ORDER BY target.key",
        )
        .bind(current.as_str())
        .fetch_all(&mut *conn)
        .await?;
        for (key,) in rows {
            let key = TaskKey::from(key);
            if seen.insert(key.clone()) {
                queue.push_back(key);
            }
        }
    }
    Ok(ordered)
}

pub(crate) async fn sync_blocking_status(
    conn: &mut SqliteConnection,
    keys: &[TaskKey],
) -> Result<Vec<StatusShift>> {
    let mut shifts = Vec::new();
    for key in keys {
        let row: Option<(String, Option<String>)> = sqlx::query_as(
            "SELECT status, blocked_from_status FROM tasks WHERE key = ? AND deleted_at IS NULL",
        )
        .bind(key.as_str())
        .fetch_optional(&mut *conn)
        .await?;
        let Some((status, blocked_from)) = row else {
            continue;
        };
        let status = match Status::from_db(&status) {
            Some(status) => status,
            None => continue,
        };
        if matches!(status, Status::Done | Status::Cancelled) {
            continue;
        }
        let has_blocker = has_open_blocked_by(conn, key.as_str()).await?;
        if has_blocker {
            if status == Status::Blocked {
                continue;
            }
            let previous = is_restorable_status(status).then(|| status.as_str().to_string());
            sqlx::query(
                "UPDATE tasks SET status = 'blocked', blocked_from_status = ?, updated_at = ? WHERE key = ?",
            )
            .bind(previous)
            .bind(now_iso())
            .bind(key.as_str())
            .execute(&mut *conn)
            .await?;
            shifts.push(StatusShift {
                task_id: key.clone(),
                from: status,
                to: Status::Blocked,
            });
        } else if status == Status::Blocked && blocked_from.is_some() {
            let restored = blocked_from
                .as_deref()
                .and_then(Status::from_db)
                .filter(|status| is_restorable_status(*status))
                .unwrap_or(Status::Open);
            sqlx::query(
                "UPDATE tasks SET status = ?, blocked_from_status = NULL, blocked_reason = NULL, updated_at = ? WHERE key = ?",
            )
            .bind(restored.as_str())
            .bind(now_iso())
            .bind(key.as_str())
            .execute(&mut *conn)
            .await?;
            shifts.push(StatusShift {
                task_id: key.clone(),
                from: Status::Blocked,
                to: restored,
            });
        }
    }
    Ok(shifts)
}
