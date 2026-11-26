use super::*;

pub async fn create_task(db: &Db, input: NewTask) -> Result<Created> {
    let project = project_prefix(db, input.project_id.as_str()).await?;
    let Some(prefix) = project else {
        return Err(AppError::not_found(format!(
            "project {} not found",
            input.project_id
        )));
    };

    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::validation("task title is required"));
    }
    let status = input.status.unwrap_or(Status::Backlog);
    let priority = input.priority.unwrap_or(Priority::Medium);

    let tags = normalize_tags(input.tags.as_deref());
    crate::tags::validate_tags(db, &tags).await?;
    let source_file = empty_to_null(
        input
            .source_file
            .as_ref()
            .and_then(|value| value.as_deref()),
    );
    let estimate = input.estimate.flatten();
    let assignee = empty_to_null(input.assignee.as_ref().and_then(|value| value.as_deref()));
    let due_at = normalize_due_date(input.due_at.as_ref().and_then(|value| value.as_deref()));
    if input
        .due_at
        .as_ref()
        .and_then(|value| value.as_deref())
        .is_some()
        && due_at.is_none()
    {
        return Err(AppError::validation(format!(
            "invalid due date: {}",
            input
                .due_at
                .as_ref()
                .and_then(|value| value.as_deref())
                .unwrap_or_default()
        )));
    }

    let epic_id = input.epic_id.as_ref().and_then(|value| value.as_ref());
    let resolved_epic = match epic_id {
        Some(epic) => {
            Some(resolve_epic_id(db, epic.as_str(), input.project_id.as_str(), None).await?)
        }
        None => None,
    };
    if resolved_epic.is_some() && input.is_epic == Some(true) {
        return Err(AppError::validation(
            "epics are flat: an epic cannot belong to another epic, leave epic_id unset",
        ));
    }

    let scope_id = resolve_scope_ref(
        db,
        input
            .scope_id
            .as_ref()
            .and_then(|value| value.map(ScopeId::get)),
        input.scope.as_ref().map(|value| value.as_deref()),
        input.project_id.as_str(),
    )
    .await?;

    let blocked_reason = empty_to_null(
        input
            .blocked_reason
            .as_ref()
            .and_then(|value| value.as_deref()),
    );
    if let Some(reason) = &blocked_reason
        && reason.chars().count() > BLOCKED_REASON_MAX_LENGTH
    {
        return Err(AppError::validation(format!(
            "blocked_reason is too long: {} characters, max {BLOCKED_REASON_MAX_LENGTH}",
            reason.chars().count()
        )));
    }
    if blocked_reason.is_some() && status != Status::Blocked {
        return Err(AppError::validation(
            "blocked_reason is only allowed on a blocked task",
        ));
    }

    let now = now_iso();
    let closed_at = matches!(status, Status::Done | Status::Cancelled).then(|| now.clone());
    let mut tx = db.begin().await?;
    let number = allocate_number_tx(&mut tx, input.project_id.as_str()).await?;
    let id = TaskUuid::new();
    let key = format!("{prefix}-{number}");
    sqlx::query(
        "INSERT INTO tasks (id, key, project_id, number, title, description, status, priority, is_epic, epic_id, scope_id, source_file, estimate, assignee, due_at, blocked_reason, created_at, updated_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM tasks WHERE key = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id.as_str())
    .bind(&key)
    .bind(input.project_id.as_str())
    .bind(number)
    .bind(title)
    .bind(input.description.clone().unwrap_or_default())
    .bind(status.as_str())
    .bind(priority.as_str())
    .bind(i64::from(input.is_epic == Some(true)))
    .bind(resolved_epic.as_ref().map(TaskKey::as_str))
    .bind(scope_id)
    .bind(source_file.as_deref())
    .bind(estimate.as_ref().map(|value| value.as_str()))
    .bind(assignee.as_deref())
    .bind(due_at.as_deref())
    .bind(blocked_reason.as_deref())
    .bind(&now)
    .bind(&now)
    .bind(closed_at.as_deref())
    .execute(&mut *tx)
    .await?;
    for tag in &tags {
        sqlx::query("INSERT INTO task_tags (task_id, tag) VALUES (?, ?)")
            .bind(id.as_str())
            .bind(tag.as_str())
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    let task = read_task(db, &TaskKey::from(key)).await?;
    let warnings = warnings_for(db, &task).await?;
    Ok(Created { task, warnings })
}

pub(crate) async fn allocate_number_tx(tx: &mut Tx, project_id: &str) -> Result<i64> {
    let (high, used): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE((SELECT last_number FROM task_number_high_water WHERE project_id = ?), 0), COALESCE((SELECT MAX(number) FROM tasks WHERE project_id = ?), 0)",
    )
    .bind(project_id)
    .bind(project_id)
    .fetch_one(&mut **tx)
    .await?;
    let next = high.max(used) + 1;
    sqlx::query(
        "INSERT INTO task_number_high_water (project_id, last_number) VALUES (?, ?) ON CONFLICT (project_id) DO UPDATE SET last_number = excluded.last_number",
    )
    .bind(project_id)
    .bind(next)
    .execute(&mut **tx)
    .await?;
    Ok(next)
}
