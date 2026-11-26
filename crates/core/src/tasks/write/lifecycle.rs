use super::*;

pub async fn update_task(db: &Db, id: &str, patch: TaskPatch) -> Result<Updated> {
    let outcome = update_task_detailed(db, id, patch).await?;
    let warnings = warnings_for(db, &outcome.task).await?;
    Ok(Updated {
        task: outcome.task,
        changes: outcome.changes,
        released: outcome.released,
        warnings,
        closed_epic: outcome.closed_epic,
        reopened_epic: outcome.reopened_epic,
    })
}

pub async fn close_task_detailed(
    db: &Db,
    id: &str,
    reason: crate::tasks::model::ClosedReason,
) -> Result<UpdateOutcome> {
    let target = crate::tasks::resolve::resolve_task_id(db, id).await?;
    let current = read_task(db, &target).await?;
    let status = reason.status();
    let changes = vec![
        change("status", json!(current.status), json!(status)),
        change("closed_reason", json!(current.closed_reason), json!(reason)),
    ];
    let now = now_iso();
    let mut tx = db.begin().await?;
    sqlx::query(
        "UPDATE tasks SET status = ?, closed_at = ?, closed_reason = ?, auto_closed = 0, updated_at = ? WHERE key = ?",
    )
    .bind(status.as_str())
    .bind(&now)
    .bind(reason.as_str())
    .bind(&now)
    .bind(target.as_str())
    .execute(&mut *tx)
    .await?;
    let affected = blocking_downstream(&mut tx, std::slice::from_ref(&target)).await?;
    let shifts = sync_blocking_status(&mut tx, &affected[1..]).await?;
    tx.commit().await?;

    let released = shifts_to_released(shifts);
    let closed_epic = auto_close_epic(db, &target, &now).await?;
    Ok(UpdateOutcome {
        task: read_task(db, &target).await?,
        changes,
        released,
        closed_epic,
        reopened_epic: None,
    })
}

pub async fn close_task(
    db: &Db,
    id: &str,
    reason: crate::tasks::model::ClosedReason,
) -> Result<Closed> {
    let outcome = close_task_detailed(db, id, reason).await?;
    let warnings = warnings_for(db, &outcome.task).await?;
    Ok(Closed {
        task: outcome.task,
        changes: outcome.changes,
        released: outcome.released,
        warnings,
        closed_epic: outcome.closed_epic,
    })
}

pub(crate) async fn list_blocked_by(db: &Db, key: &str) -> Result<Vec<TaskKey>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT tasks.key FROM task_links l JOIN tasks ON tasks.id = l.source_task_id WHERE l.link_type = 'blocks' AND l.target_task_id = (SELECT id FROM tasks target WHERE target.key = ?) AND tasks.deleted_at IS NULL",
    )
    .bind(key)
    .fetch_all(db.pool())
    .await?;
    let mut keys: Vec<TaskKey> = rows.into_iter().map(|(key,)| TaskKey::from(key)).collect();
    keys.sort();
    Ok(keys)
}

pub async fn delete_task(db: &Db, id: &str) -> Result<Deleted> {
    let target = crate::tasks::resolve::resolve_task_id(db, id).await?;
    let info = crate::tasks::sql::blocking_info_for(db, &[target.to_string()])
        .await?
        .remove(target.as_str())
        .unwrap_or_default();
    let blocker_ids = info.blocked_by;
    let blocked_ids = info.blocks;
    let mut blocked_before: Vec<(TaskKey, Vec<TaskKey>)> = Vec::new();
    for blocked in &blocked_ids {
        blocked_before.push((
            blocked.clone(),
            list_blocked_by(db, blocked.as_str()).await?,
        ));
    }
    let children: Vec<(String,)> = sqlx::query_as(
        "SELECT key FROM tasks WHERE epic_id = (SELECT id FROM tasks epic WHERE epic.key = ?) AND deleted_at IS NULL",
    )
    .bind(target.as_str())
    .fetch_all(db.pool())
    .await?;

    let now = now_iso();
    let mut tx = db.begin().await?;
    let affected = blocking_downstream(&mut tx, std::slice::from_ref(&target)).await?;
    sqlx::query(
        "UPDATE tasks SET epic_id = NULL, updated_at = ? WHERE epic_id = (SELECT id FROM tasks epic WHERE epic.key = ?)",
    )
    .bind(&now)
    .bind(target.as_str())
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE key = ?")
        .bind(&now)
        .bind(&now)
        .bind(target.as_str())
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "DELETE FROM task_links WHERE source_task_id = (SELECT id FROM tasks WHERE key = ?) OR target_task_id = (SELECT id FROM tasks WHERE key = ?)",
    )
    .bind(target.as_str())
    .bind(target.as_str())
    .execute(&mut *tx)
    .await?;
    let shifts = sync_blocking_status(&mut tx, &affected[1..]).await?;
    tx.commit().await?;

    let mut released: Vec<ReleasedLink> = shifts_to_released(shifts);
    for (blocked, before) in &blocked_before {
        let after: Vec<TaskKey> = before
            .iter()
            .filter(|blocker| blocker.as_str() != target.as_str())
            .cloned()
            .collect();
        let changes = vec![change("blocked_by", json!(before), json!(after))];
        match released.iter_mut().find(|link| link.task_id == *blocked) {
            Some(link) => {
                link.changes.splice(0..0, changes);
            }
            None => released.push(ReleasedLink {
                task_id: blocked.clone(),
                changes,
            }),
        }
    }
    for (child,) in children {
        released.push(ReleasedLink {
            task_id: TaskKey::from(child),
            changes: vec![change("epic_id", json!(target), Value::Null)],
        });
    }
    Ok(Deleted {
        id: target,
        deleted_at: now.clone(),
        changes: vec![
            change("deleted_at", Value::Null, json!(now)),
            change("blocked_by", json!(blocker_ids), json!([])),
        ],
        released,
    })
}

pub async fn restore_task(db: &Db, id: &str) -> Result<Task> {
    let target = crate::tasks::resolve::resolve_task_id_any(db, id).await?;
    let task = task_by_key(db, target.as_str())
        .await?
        .ok_or_else(|| AppError::not_found(format!("task {target} not found")))?;
    if task.deleted_at.is_none() {
        return Err(AppError::conflict(format!("task {target} is not deleted")));
    }
    let now = now_iso();
    sqlx::query("UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE key = ?")
        .bind(&now)
        .bind(target.as_str())
        .execute(db.pool())
        .await?;
    read_task(db, &target).await
}

pub(crate) async fn collect_subtree(db: &Db, root: &str) -> Result<Vec<String>> {
    let mut keys = vec![root.to_string()];
    let mut index = 0;
    while index < keys.len() {
        let current = keys[index].clone();
        index += 1;
        let children: Vec<(String,)> = sqlx::query_as(
            "SELECT tasks.key AS key FROM tasks WHERE tasks.epic_id = (SELECT id FROM tasks epic WHERE epic.key = ?) ORDER BY tasks.number",
        )
        .bind(&current)
        .fetch_all(db.pool())
        .await?;
        for (key,) in children {
            keys.push(key);
        }
    }
    Ok(keys)
}

pub async fn move_task(db: &Db, id: &str, project_id: &str) -> Result<Task> {
    let source_key = crate::tasks::resolve::resolve_task_id(db, id).await?;
    let task = read_task(db, &source_key).await?;
    let target: Option<(String, String)> =
        sqlx::query_as("SELECT id, prefix FROM projects WHERE id = ?")
            .bind(project_id)
            .fetch_optional(db.pool())
            .await?;
    let Some((target_id, target_prefix)) = target else {
        return Err(AppError::not_found(format!(
            "project {project_id} not found"
        )));
    };
    if task.project_id.as_str() == target_id {
        return Ok(task);
    }

    let now = now_iso();
    let subtree = collect_subtree(db, source_key.as_str()).await?;
    let mut tx = db.begin().await?;
    let mut moved_key = String::new();
    for key in subtree {
        sqlx::query(
            "INSERT INTO task_move_history (old_key, task_id, created_at)
             SELECT ?, id, ? FROM tasks WHERE key = ?
             ON CONFLICT (old_key) DO NOTHING",
        )
        .bind(&key)
        .bind(&now)
        .bind(&key)
        .execute(&mut *tx)
        .await?;
        let number = allocate_number_tx(&mut tx, &target_id).await?;
        let new_key = format!("{target_prefix}-{number}");
        if key == source_key.as_str() {
            sqlx::query(
                "UPDATE tasks SET project_id = ?, number = ?, key = ?, epic_id = NULL, scope_id = NULL, updated_at = ? WHERE key = ?",
            )
            .bind(&target_id)
            .bind(number)
            .bind(&new_key)
            .bind(&now)
            .bind(&key)
            .execute(&mut *tx)
            .await?;
            moved_key = new_key;
        } else {
            sqlx::query(
                "UPDATE tasks SET project_id = ?, number = ?, key = ?, scope_id = NULL, updated_at = ? WHERE key = ?",
            )
            .bind(&target_id)
            .bind(number)
            .bind(&new_key)
            .bind(&now)
            .bind(&key)
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await?;
    read_task(db, &TaskKey::from(moved_key)).await
}
