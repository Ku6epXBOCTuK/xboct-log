use super::rows::blocking_info_for;
use super::*;

pub(crate) fn fields_of(filters: &TaskFilters) -> Option<Vec<String>> {
    parse_fields(filters.fields.as_ref())
}

pub(crate) fn add_field(parsed: &mut Vec<String>, field: &str) {
    let field = field.trim();
    if field.is_empty() || parsed.iter().any(|known| known.as_str() == field) {
        return;
    }
    parsed.push(field.to_owned());
}

pub(crate) fn parse_fields(fields: Option<&FieldSelection>) -> Option<Vec<String>> {
    let fields = fields?;
    let mut parsed: Vec<String> = Vec::new();
    match fields {
        FieldSelection::Csv(raw) => {
            for field in raw.split(',') {
                add_field(&mut parsed, field);
            }
        }
        FieldSelection::List(values) => {
            for field in values {
                add_field(&mut parsed, field);
            }
        }
    }
    if parsed.is_empty() {
        None
    } else {
        Some(parsed)
    }
}

pub(crate) fn pick_fields(task: Task, fields: Option<&[String]>) -> TaskListEntry {
    let Some(fields) = fields else {
        return TaskListEntry::Full(task);
    };
    macro_rules! pick {
        ($($field:ident),* $(,)?) => {{
            let mut matched = false;
            $(
                if fields.iter().any(|name| name.as_str() == stringify!($field)) {
                    matched = true;
                }
            )*
            if !matched {
                return TaskListEntry::Full(task);
            }
            let view = TaskView::from(task);
            TaskListEntry::Projected(TaskView {
                $(
                    $field: if fields.iter().any(|name| name.as_str() == stringify!($field)) {
                        view.$field.clone()
                    } else {
                        None
                    },
                )*
                ..view
            })
        }};
    }
    pick!(
        title,
        description,
        status,
        priority,
        is_epic,
        epic_id,
        scope_id,
        source_file,
        tags,
        estimate,
        assignee,
        due_at,
        attachments_count,
        created_at,
        updated_at,
        closed_at,
        closed_reason,
        blocked_reason,
        deleted_at,
        project_name,
        scope_name,
        short_description,
        blocked_by,
        blocks,
        relates_to,
        duplicates,
        duplicated_by,
        children_counts,
        plan_ids,
        plan_names,
    )
}

pub async fn list_tasks(db: &Db, filters: &TaskFilters) -> Result<TaskList> {
    filters.validate()?;
    let (limit, offset) = filters.pagination()?;
    list_tasks_unchecked(db, filters, limit, offset).await
}

pub(crate) async fn list_tasks_unchecked(
    db: &Db,
    filters: &TaskFilters,
    limit: Limit,
    offset: Offset,
) -> Result<TaskList> {
    let resolved_filters;
    let filters = match &filters.plan_id {
        Some(raw) => {
            resolved_filters = TaskFilters {
                plan_id: Some(crate::common::resolve_plan_id(db.pool(), raw).await?),
                ..(*filters).clone()
            };
            &resolved_filters
        }
        None => filters,
    };
    let include_project = filters.include_project == Some(true);
    let include_scope = filters.include_scope == Some(true);
    let include_description = filters.include_description == Some(true)
        || fields_of(filters)
            .is_some_and(|fields| fields.iter().any(|field| field.as_str() == "description"));
    let include_plan_names = filters.include_plan_names == Some(true)
        || fields_of(filters)
            .is_some_and(|fields| fields.iter().any(|field| field.as_str() == "plan_names"));

    let mut count = QueryBuilder::new("SELECT COUNT(*) FROM tasks");
    push_from(&mut count, filters);
    push_where(&mut count, filters);
    let total: i64 = count.build_query_scalar().fetch_one(db.pool()).await?;

    let mut query = QueryBuilder::new(
        "SELECT tasks.*, (SELECT key FROM tasks epic WHERE epic.id = tasks.epic_id) AS epic_key, (SELECT COUNT(*) FROM task_attachments a WHERE a.task_id = tasks.id AND a.deleted_at IS NULL) AS attachments_count, ",
    );
    if include_project {
        query.push("projects.name AS project_name, ");
    } else {
        query.push("NULL AS project_name, ");
    }
    if include_scope {
        query.push("scopes.name AS scope_name FROM tasks");
    } else {
        query.push("NULL AS scope_name FROM tasks");
    }
    push_from(&mut query, filters);
    push_where(&mut query, filters);
    push_order(&mut query, filters);
    query
        .push(" LIMIT ")
        .push_bind(limit.get())
        .push(" OFFSET ")
        .push_bind(offset.get());

    let rows: Vec<TaskRow> = query.build_query_as().fetch_all(db.pool()).await?;
    let keys: Vec<String> = rows.iter().map(|row| row.key.clone()).collect();
    let mut tags = tags_for_tasks(db, &keys).await?;
    let mut blocking = blocking_info_for(db, &keys).await?;
    let mut plan_ids = plan_ids_for(db, &keys).await?;
    let mut plan_names = if include_plan_names {
        plan_names_for(db, &keys).await?
    } else {
        HashMap::new()
    };

    let fields = fields_of(filters);
    let items: Vec<_> = rows
        .into_iter()
        .map(|row| {
            let key = row.key.clone();
            let mut task = row_to_task(
                row,
                tags.remove(&key).unwrap_or_default(),
                blocking.remove(&key).unwrap_or_default(),
            );
            task.plan_ids = plan_ids.remove(&key).unwrap_or_default();
            task.plan_names = plan_names.remove(&key);
            if let Some(chars) = filters.description_chars {
                let preview =
                    description_preview(task.description.as_deref().unwrap_or_default(), chars);
                if include_description {
                    task.short_description = None;
                    task.description = Some(preview);
                } else {
                    task.short_description = Some(preview);
                    task.description = None;
                }
            } else if include_description {
                task.short_description = None;
            } else {
                task.short_description = Some(short_description(
                    task.description.as_deref().unwrap_or_default(),
                ));
                task.description = None;
            }
            pick_fields(task, fields.as_deref())
        })
        .collect();

    let size = items.len();
    let next = offset
        .get()
        .saturating_add(i64::try_from(size).unwrap_or(i64::MAX));
    Ok(TaskList {
        items,
        total,
        offset: offset.get(),
        size,
        page_size: limit.get(),
        next_offset: (total > next).then_some(next),
    })
}

pub async fn count_epic_children_by_status(
    db: &Db,
    epic_key: &str,
) -> Result<std::collections::BTreeMap<String, i64>> {
    let rows: Vec<(String, i64)> = sqlx::query_as(
		"SELECT status, COUNT(*) FROM tasks WHERE epic_id = (SELECT id FROM tasks epic WHERE epic.key = ?) AND deleted_at IS NULL GROUP BY status",
	)
	.bind(epic_key)
	.fetch_all(db.pool())
	.await?;
    let mut counts: std::collections::BTreeMap<String, i64> = Status::ALL
        .iter()
        .map(|status| (status.as_str().to_string(), 0))
        .collect();
    let mut total = 0;
    for (status, count) in rows {
        total += count;
        counts.insert(status, count);
    }
    counts.insert("total".to_string(), total);
    Ok(counts)
}

pub(crate) async fn task_by_key(db: &Db, key: &str) -> Result<Option<Task>> {
    let row = fetch_by_id::<TaskRow, _>(
        sqlx::query(
			"SELECT tasks.*, (SELECT key FROM tasks epic WHERE epic.id = tasks.epic_id) AS epic_key, (SELECT COUNT(*) FROM task_attachments a WHERE a.task_id = tasks.id AND a.deleted_at IS NULL) AS attachments_count, NULL AS project_name, NULL AS scope_name FROM tasks WHERE tasks.key = ?",
		)
		.bind(key),
        db.pool(),
    )
    .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    let task_key = row.key.clone();
    let tags = tags_for_tasks(db, std::slice::from_ref(&task_key)).await?;
    let blocking = blocking_info_for(db, std::slice::from_ref(&task_key)).await?;
    let mut plan_ids = plan_ids_for(db, std::slice::from_ref(&task_key)).await?;
    let mut plan_names = plan_names_for(db, std::slice::from_ref(&task_key)).await?;
    let mut task = row_to_task(
        row,
        tags.get(&task_key).cloned().unwrap_or_default(),
        blocking.get(&task_key).cloned().unwrap_or_default(),
    );
    task.plan_ids = plan_ids.remove(&task_key).unwrap_or_default();
    task.plan_names = plan_names.remove(&task_key);
    Ok(Some(task))
}

pub async fn get_task(db: &Db, id: &str) -> Result<Task> {
    if let Some(task) = task_by_key(db, id).await?
        && task.deleted_at.is_none()
    {
        return Ok(task);
    }
    let key = resolve_task_id(db, id).await?;
    task_by_key(db, key.as_str())
        .await?
        .ok_or_else(|| AppError::unexpected(format!("task {key} disappeared while reading")))
}

pub(crate) fn short_description(description: &str) -> String {
    let line = first_prose_line(description);
    let plain = plain_line(&line);
    if plain.chars().count() > 120 {
        let cut: String = plain.chars().take(120).collect();
        format!("{cut}…")
    } else {
        plain
    }
}

pub(crate) fn description_preview(description: &str, chars: usize) -> String {
    let joined = description.replace('\n', " ").replace("```", "");
    let collapsed = joined.split_whitespace().collect::<Vec<_>>().join(" ");
    let plain = plain_line(&collapsed);
    if plain.chars().count() > chars {
        let cut: String = plain.chars().take(chars).collect();
        format!("{cut}…")
    } else {
        plain
    }
}

pub(crate) fn first_prose_line(description: &str) -> String {
    let mut fence = false;
    for line in description.split('\n') {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with("```") {
            fence = !fence;
            continue;
        }
        if !fence {
            return line.to_string();
        }
    }
    String::new()
}

pub(crate) fn plain_line(line: &str) -> String {
    use std::sync::LazyLock;
    static HEADING: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"^#{1,6}\s+").unwrap());
    static QUOTE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"^>\s*").unwrap());
    static LIST: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"^(?:[-*+]|\d+[.)])\s+").unwrap());
    static CHECKBOX: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"^\[[ xX]\]\s+").unwrap());
    static BOLD_STARS: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"\*\*(.+?)\*\*").unwrap());
    static BOLD_UNDERSCORES: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"__(.+?)__").unwrap());
    static CODE: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"`([^`]+)`").unwrap());
    static LINK: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r"!?\[([^\]]*)\]\([^)]*\)").unwrap());

    let mut text = HEADING.replace(line, "").into_owned();
    text = QUOTE.replace(&text, "").into_owned();
    text = LIST.replace(&text, "").into_owned();
    text = CHECKBOX.replace(&text, "").into_owned();
    text = BOLD_STARS.replace_all(&text, "$1").into_owned();
    text = BOLD_UNDERSCORES.replace_all(&text, "$1").into_owned();
    text = CODE.replace_all(&text, "$1").into_owned();
    text = LINK.replace_all(&text, "$1").into_owned();
    text.trim().to_string()
}
