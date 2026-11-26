use super::*;

pub async fn update_task_detailed(db: &Db, id: &str, patch: TaskPatch) -> Result<UpdateOutcome> {
    if patch.is_empty() {
        return Err(AppError::validation(
            "nothing to update: name at least one field next to task_id, e.g. {task_id: 'LOG-254', status: 'in-progress'}",
        ));
    }
    let target = crate::tasks::resolve::resolve_task_id(db, id).await?;
    let current = read_task(db, &target).await?;
    if let Some(status) = patch.status
        && status != Status::Blocked
        && !matches!(status, Status::Done | Status::Cancelled)
        && !matches!(current.status, Status::Done | Status::Cancelled)
    {
        let mut conn = db.pool().acquire().await?;
        let blockers = list_open_blocked_by(&mut conn, target.as_str()).await?;
        if !blockers.is_empty() {
            let ids = blockers
                .iter()
                .map(TaskKey::as_str)
                .collect::<Vec<_>>()
                .join(", ");
            return Err(AppError::validation(format!(
                "task {target} has open blocked_by [{ids}]; finish the blockers first with tasks_close (reason fixed) or tasks_update status 'done' before setting status to '{}'",
                status.as_str()
            )));
        }
    }
    let mut changes: Vec<Change> = Vec::new();
    let mut sets: Vec<String> = Vec::new();
    let mut params: Vec<Option<String>> = Vec::new();
    let now = now_iso();

    let push_text = |sets: &mut Vec<String>,
                     params: &mut Vec<Option<String>>,
                     sql: &str,
                     value: Option<String>| {
        sets.push(sql.to_string());
        params.push(value);
    };

    if let Some(title) = &patch.title {
        let title = title.trim();
        if title.is_empty() {
            return Err(AppError::validation("task title is required"));
        }
        push_text(&mut sets, &mut params, "title = ?", Some(title.to_string()));
        if title != current.title {
            changes.push(change("title", json!(current.title), json!(title)));
        }
    }
    let description_changed = match &patch.description {
        Some(description) => {
            push_text(
                &mut sets,
                &mut params,
                "description = ?",
                Some(description.clone()),
            );
            description != current.description.as_deref().unwrap_or_default()
        }
        None => false,
    };

    if let Some(status) = patch.status {
        push_text(
            &mut sets,
            &mut params,
            "status = ?",
            Some(status.as_str().to_string()),
        );
        if status != current.status {
            sets.push("auto_closed = 0".to_string());
            changes.push(change("status", json!(current.status), json!(status)));
        }
        if status == Status::Blocked {
            if current.status != Status::Blocked {
                let previous = if is_restorable_status(current.status) {
                    Some(current.status.as_str().to_string())
                } else {
                    None
                };
                push_text(&mut sets, &mut params, "blocked_from_status = ?", previous);
            }
        } else {
            sets.push("blocked_from_status = NULL".to_string());
            if let Some(reason) = &current.blocked_reason
                && patch.blocked_reason.is_none()
            {
                sets.push("blocked_reason = NULL".to_string());
                changes.push(change("blocked_reason", json!(reason), Value::Null));
            }
        }
        let closed_now = matches!(status, Status::Done | Status::Cancelled);
        let was_closed = current.closed_at.is_some();
        if closed_now && !was_closed {
            push_text(&mut sets, &mut params, "closed_at = ?", Some(now.clone()));
        } else if !closed_now && was_closed {
            push_text(&mut sets, &mut params, "closed_at = ?", None);
            push_text(&mut sets, &mut params, "closed_reason = ?", None);
        }
    }

    if let Some(reason) = &patch.blocked_reason {
        let blocked_reason = empty_to_null(reason.as_deref());
        if let Some(value) = &blocked_reason
            && value.chars().count() > BLOCKED_REASON_MAX_LENGTH
        {
            return Err(AppError::validation(format!(
                "blocked_reason is too long: {} characters, max {BLOCKED_REASON_MAX_LENGTH}",
                value.chars().count()
            )));
        }
        let next_status = patch.status.unwrap_or(current.status);
        if blocked_reason.is_some() && next_status != Status::Blocked {
            return Err(AppError::validation(
                "blocked_reason is only allowed on a blocked task",
            ));
        }
        if blocked_reason != current.blocked_reason {
            push_text(
                &mut sets,
                &mut params,
                "blocked_reason = ?",
                blocked_reason.clone(),
            );
            changes.push(change(
                "blocked_reason",
                json!(current.blocked_reason),
                json!(blocked_reason),
            ));
        }
    }

    if let Some(priority) = patch.priority {
        push_text(
            &mut sets,
            &mut params,
            "priority = ?",
            Some(priority.as_str().to_string()),
        );
        if priority != current.priority {
            changes.push(change("priority", json!(current.priority), json!(priority)));
        }
    }
    if let Some(estimate) = &patch.estimate {
        push_text(
            &mut sets,
            &mut params,
            "estimate = ?",
            estimate.map(|value| value.as_str().to_string()),
        );
        let next = estimate.map(|value| value.as_str());
        let was = current.estimate.as_ref().map(|value| value.as_str());
        if next != was {
            changes.push(change("estimate", json!(was), json!(next)));
        }
    }
    if let Some(assignee) = &patch.assignee {
        let assignee = empty_to_null(assignee.as_deref());
        push_text(&mut sets, &mut params, "assignee = ?", assignee.clone());
        if assignee != current.assignee {
            changes.push(change("assignee", json!(current.assignee), json!(assignee)));
        }
    }
    if let Some(due) = &patch.due_at {
        let raw = due.as_deref().unwrap_or_default();
        let due_at = normalize_due_date(Some(raw));
        if due_at.is_none() && !raw.trim().is_empty() {
            return Err(AppError::validation(format!("invalid due date: {raw}")));
        }
        push_text(&mut sets, &mut params, "due_at = ?", due_at.clone());
        if due_at != current.due_at {
            changes.push(change("due_at", json!(current.due_at), json!(due_at)));
        }
    }
    if let Some(is_epic) = patch.is_epic {
        if current.is_epic && !is_epic {
            let (count,): (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM tasks WHERE epic_id = (SELECT id FROM tasks epic WHERE epic.key = ?) AND deleted_at IS NULL",
            )
            .bind(target.as_str())
            .fetch_one(db.pool())
            .await?;
            if count > 0 {
                return Err(AppError::validation(format!(
                    "cannot demote an epic with {count} subtask(s): detach or move them first"
                )));
            }
        }
        push_text(
            &mut sets,
            &mut params,
            "is_epic = ?",
            Some(i64::from(is_epic).to_string()),
        );
        if is_epic != current.is_epic {
            changes.push(change("is_epic", json!(current.is_epic), json!(is_epic)));
        }
    }

    let mut next_tags: Option<Vec<TagName>> = None;
    if let Some(tags) = &patch.tags {
        let tags = normalize_tags(Some(tags));
        crate::tags::validate_tags(db, &tags).await?;
        let unchanged = tags.len() == current.tags.len()
            && tags
                .iter()
                .all(|tag| current.tags.iter().any(|known| known == tag));
        if !unchanged {
            let mut sorted = tags.clone();
            sorted.sort();
            changes.push(change("tags", json!(current.tags), json!(sorted)));
        }
        next_tags = Some(tags);
    }

    if let Some(source_file) = &patch.source_file {
        push_text(
            &mut sets,
            &mut params,
            "source_file = ?",
            empty_to_null(source_file.as_deref()),
        );
    }

    if let Some(epic_id) = &patch.epic_id {
        let resolved = match epic_id {
            Some(epic) => Some(
                resolve_epic_id(
                    db,
                    epic.as_str(),
                    current.project_id.as_str(),
                    Some(target.as_str()),
                )
                .await?,
            ),
            None => None,
        };
        push_text(
            &mut sets,
            &mut params,
            "epic_id = (SELECT id FROM tasks WHERE key = ?)",
            resolved.as_ref().map(|key| key.as_str().to_string()),
        );
        let was = current.epic_id.as_ref().map(TaskKey::as_str);
        let next = resolved.as_ref().map(TaskKey::as_str);
        if was != next {
            changes.push(change("epic_id", json!(was), json!(next)));
        }
    }

    let next_is_epic = patch.is_epic.unwrap_or(current.is_epic);
    let next_epic_id = patch
        .epic_id
        .as_ref()
        .map(|value| value.as_ref())
        .unwrap_or(current.epic_id.as_ref());
    if next_is_epic && next_epic_id.is_some() {
        return Err(AppError::validation(
            "epics are flat: an epic cannot belong to another epic, leave epic_id unset",
        ));
    }

    if patch.scope_id.is_some() || patch.scope.is_some() {
        let scope_id = resolve_scope_ref(
            db,
            patch
                .scope_id
                .as_ref()
                .and_then(|value| value.map(ScopeId::get)),
            patch.scope.as_ref().map(|value| value.as_deref()),
            current.project_id.as_str(),
        )
        .await?;
        let scope_id = scope_id.map(ScopeId::from);
        push_text(
            &mut sets,
            &mut params,
            "scope_id = ?",
            scope_id.map(|value| value.get().to_string()),
        );
        if scope_id != current.scope_id {
            changes.push(change("scope_id", json!(current.scope_id), json!(scope_id)));
        }
    }

    push_text(&mut sets, &mut params, "updated_at = ?", Some(now.clone()));

    let closed_now = patch
        .status
        .is_some_and(|status| matches!(status, Status::Done | Status::Cancelled))
        && !matches!(current.status, Status::Done | Status::Cancelled);
    let reopened_now = patch
        .status
        .is_some_and(|status| !matches!(status, Status::Done | Status::Cancelled))
        && matches!(current.status, Status::Done | Status::Cancelled);

    if description_changed {
        let mut connection = db.pool().acquire().await?;
        record_revision(
            &mut connection,
            target.as_str(),
            "description",
            None,
            current.description.as_deref().unwrap_or_default(),
            chrono::DateTime::parse_from_rfc3339(&now)
                .map(|value| value.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now()),
        )
        .await?;
    }
    let mut tx = db.begin().await?;
    let sql = format!("UPDATE tasks SET {} WHERE key = ?", sets.join(", "));
    let mut update = sqlx::query(sqlx::AssertSqlSafe(sql));
    for param in &params {
        update = update.bind(param.clone());
    }
    update.bind(target.as_str()).execute(&mut *tx).await?;

    if let Some(tags) = &next_tags {
        sqlx::query("DELETE FROM task_tags WHERE task_id = (SELECT id FROM tasks WHERE key = ?)")
            .bind(target.as_str())
            .execute(&mut *tx)
            .await?;
        for tag in tags {
            sqlx::query(
                "INSERT INTO task_tags (task_id, tag) SELECT id, ? FROM tasks WHERE key = ?",
            )
            .bind(tag.as_str())
            .bind(target.as_str())
            .execute(&mut *tx)
            .await?;
        }
    }
    let affected = blocking_downstream(&mut tx, std::slice::from_ref(&target)).await?;
    let reblocked = reopened_now
        && matches!(current.status, Status::Done | Status::Cancelled)
        && patch.status.is_some_and(is_restorable_status);
    let checked = if reblocked {
        affected.as_slice()
    } else {
        &affected[1..]
    };
    let mut shifts = sync_blocking_status(&mut tx, checked).await?;
    tx.commit().await?;

    let mut changes = changes;
    if let Some(index) = shifts.iter().position(|shift| shift.task_id == target) {
        let shift = shifts.remove(index);
        if let Some(change) = changes.iter_mut().find(|change| change.field == "status") {
            change.to = json!(shift.to);
        }
    }

    let closed_epic = if closed_now {
        auto_close_epic(db, &target, &now).await?
    } else {
        None
    };
    let reopened_epic = if reopened_now {
        reopen_auto_closed_epic(db, &target, &now).await?
    } else {
        None
    };
    Ok(UpdateOutcome {
        task: read_task(db, &target).await?,
        changes,
        released: shifts_to_released(shifts),
        closed_epic,
        reopened_epic,
    })
}
