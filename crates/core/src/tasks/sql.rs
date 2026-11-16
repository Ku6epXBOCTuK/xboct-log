use std::collections::HashMap;

use sqlx::{QueryBuilder, Sqlite};

use crate::ids::{ProjectId, ScopeId, Seq, TagName, TaskKey};
use crate::{AppError, Db, Result};

use super::filters::{LinkFilter, Sort, TaskFilters};
use super::model::{BlockingInfo, Estimate, Priority, Status, Task, TaskList, TaskRow};
use super::resolve::{normalize_task_id_input, resolve_task_id};

const SEARCH_COLUMNS: [&str; 5] = [
    "ULOWER(tasks.title) LIKE ",
    "ULOWER(tasks.description) LIKE ",
    "ULOWER(tasks.key) LIKE ",
    "ULOWER((SELECT key FROM tasks epic WHERE epic.id = tasks.epic_id)) LIKE ",
    "EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = tasks.id AND ULOWER(tt.tag) LIKE ",
];

fn push_and(qb: &mut QueryBuilder<Sqlite>, first: &mut bool) {
    if *first {
        *first = false;
        qb.push(" WHERE ");
    } else {
        qb.push(" AND ");
    }
}

fn push_in_text<T: AsRef<str>>(qb: &mut QueryBuilder<Sqlite>, column: &str, values: &[T]) {
    qb.push(column).push(" IN (");
    let mut separated = qb.separated(", ");
    for value in values {
        separated.push_bind(value.as_ref().to_string());
    }
    separated.push_unseparated(")");
}

fn push_in_int(qb: &mut QueryBuilder<Sqlite>, column: &str, values: &[i64]) {
    qb.push(column).push(" IN (");
    let mut separated = qb.separated(", ");
    for value in values {
        separated.push_bind(*value);
    }
    separated.push_unseparated(")");
}

fn push_search(qb: &mut QueryBuilder<Sqlite>, term: &str) {
    let pattern = format!("%{}%", term.to_lowercase());
    qb.push("(");
    for (index, column) in SEARCH_COLUMNS.iter().enumerate() {
        if index > 0 {
            qb.push(" OR ");
        }
        qb.push(*column).push_bind(pattern.clone());
        if index == SEARCH_COLUMNS.len() - 1 {
            qb.push(")");
        }
    }
    qb.push(")");
}

fn exact_values(filters: &TaskFilters) -> (Vec<i64>, Vec<String>) {
    let numbers = filters
        .number_exact
        .as_deref()
        .unwrap_or_default()
        .iter()
        .map(|value| value.get())
        .collect();
    let ids = filters
        .id_exact
        .as_deref()
        .unwrap_or_default()
        .iter()
        .map(|value| normalize_task_id_input(value.as_str().trim()).to_lowercase())
        .filter(|value| !value.is_empty())
        .collect();
    (numbers, ids)
}

fn push_exact(qb: &mut QueryBuilder<Sqlite>, filters: &TaskFilters) -> bool {
    let (numbers, ids) = exact_values(filters);
    if numbers.is_empty() && ids.is_empty() {
        return false;
    }
    qb.push("(");
    let mut first = true;
    if !numbers.is_empty() {
        push_in_int(qb, "tasks.number", &numbers);
        first = false;
    }
    if !ids.is_empty() {
        if !first {
            qb.push(" OR ");
        }
        push_in_text(qb, "ULOWER(tasks.key)", &ids);
    }
    qb.push(")");
    true
}

fn push_task_ref(qb: &mut QueryBuilder<Sqlite>, value: &str) {
    qb.push_bind(normalize_task_id_input(value.trim()));
}

fn push_blocking_filter(qb: &mut QueryBuilder<Sqlite>, column: &str, value: &str) {
    let (source, target) = if column == "blocked_by" {
        ("source_task_id", "target_task_id")
    } else {
        ("target_task_id", "source_task_id")
    };
    qb.push("tasks.key IN (SELECT t.key FROM tasks t WHERE t.id IN (SELECT ")
        .push(target)
        .push(" FROM task_links WHERE link_type = 'blocks' AND ")
        .push(source)
        .push(" IN (SELECT id FROM tasks WHERE key = ");
    push_task_ref(qb, value);
    qb.push(" AND deleted_at IS NULL)))");
}

fn push_where(qb: &mut QueryBuilder<Sqlite>, filters: &TaskFilters) {
    let mut first = true;

    if filters.deleted_only == Some(true) {
        push_and(qb, &mut first);
        qb.push("tasks.deleted_at IS NOT NULL");
    } else if filters.include_deleted != Some(true) {
        push_and(qb, &mut first);
        qb.push("tasks.deleted_at IS NULL");
    }

    if let Some(values) = &filters.project_id {
        push_and(qb, &mut first);
        push_in_text(qb, "tasks.project_id", &values.clone().into_vec());
    }
    if let Some(values) = &filters.exclude_project_id {
        push_and(qb, &mut first);
        qb.push("tasks.project_id NOT IN (");
        let mut separated = qb.separated(", ");
        for value in values.clone().into_vec() {
            separated.push_bind(value.into_string());
        }
        separated.push_unseparated(")");
    }
    if let Some(values) = &filters.status {
        push_and(qb, &mut first);
        let values: Vec<String> = values
            .clone()
            .into_vec()
            .into_iter()
            .map(|value| value.as_str().to_string())
            .collect();
        push_in_text(qb, "tasks.status", &values);
    }
    if let Some(values) = &filters.priority {
        push_and(qb, &mut first);
        let values: Vec<String> = values
            .clone()
            .into_vec()
            .into_iter()
            .map(|value| value.as_str().to_string())
            .collect();
        push_in_text(qb, "tasks.priority", &values);
    }
    if let Some(values) = &filters.estimate {
        push_and(qb, &mut first);
        let values: Vec<String> = values
            .clone()
            .into_vec()
            .into_iter()
            .map(|value| value.as_str().to_string())
            .collect();
        push_in_text(qb, "tasks.estimate", &values);
    }
    if let Some(values) = &filters.assignee {
        push_and(qb, &mut first);
        let values: Vec<String> = values
            .clone()
            .into_vec()
            .into_iter()
            .map(|value| value.to_lowercase())
            .collect();
        push_in_text(qb, "ULOWER(tasks.assignee)", &values);
    }
    if let Some(due_before) = &filters.due_before {
        push_and(qb, &mut first);
        qb.push("tasks.due_at IS NOT NULL AND tasks.due_at < ")
            .push_bind(due_before.clone());
    }
    if let Some(due_after) = &filters.due_after {
        push_and(qb, &mut first);
        qb.push("tasks.due_at IS NOT NULL AND tasks.due_at >= ")
            .push_bind(due_after.clone());
    }
    if let Some(is_epic) = filters.is_epic {
        push_and(qb, &mut first);
        qb.push("tasks.is_epic = ").push_bind(i64::from(is_epic));
    }
    match &filters.epic_id {
        LinkFilter::Any => {}
        LinkFilter::Null => {
            push_and(qb, &mut first);
            qb.push("tasks.epic_id IS NULL");
        }
        LinkFilter::Values(values) => {
            let refs: Vec<String> = values
                .iter()
                .map(|value| normalize_task_id_input(value.as_str().trim()))
                .collect();
            if !refs.is_empty() {
                push_and(qb, &mut first);
                qb.push("tasks.epic_id IN (SELECT id FROM tasks epic WHERE epic.key IN (");
                let mut separated = qb.separated(", ");
                for value in refs {
                    separated.push_bind(value);
                }
                separated.push_unseparated("))");
            }
        }
    }
    match &filters.scope_id {
        LinkFilter::Any => {}
        LinkFilter::Null => {
            push_and(qb, &mut first);
            qb.push("tasks.scope_id IS NULL");
        }
        LinkFilter::Values(values) => {
            let values: Vec<i64> = values.iter().map(|value| value.get()).collect();
            if !values.is_empty() {
                push_and(qb, &mut first);
                push_in_int(qb, "tasks.scope_id", &values);
            }
        }
    }
    if let Some(has_epic) = filters.has_epic {
        push_and(qb, &mut first);
        qb.push(if has_epic {
            "tasks.epic_id IS NOT NULL"
        } else {
            "tasks.epic_id IS NULL"
        });
    }
    if let Some(has_scope) = filters.has_scope {
        push_and(qb, &mut first);
        qb.push(if has_scope {
            "tasks.scope_id IS NOT NULL"
        } else {
            "tasks.scope_id IS NULL"
        });
    }
    if let Some(has_tags) = filters.has_tags {
        push_and(qb, &mut first);
        qb.push(if has_tags {
            "EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = tasks.id)"
        } else {
            "NOT EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = tasks.id)"
        });
    }
    if let Some(value) = &filters.blocked_by {
        push_and(qb, &mut first);
        push_blocking_filter(qb, "blocked_by", value.as_str());
    }
    if let Some(value) = &filters.blocks {
        push_and(qb, &mut first);
        push_blocking_filter(qb, "blocks", value.as_str());
    }
    if let Some(values) = &filters.tag {
        push_and(qb, &mut first);
        let tags: Vec<String> = values
            .clone()
            .into_vec()
            .into_iter()
            .map(|value| value.as_str().to_lowercase())
            .collect();
        qb.push("EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = tasks.id AND ULOWER(tt.tag) IN (");
        let mut separated = qb.separated(", ");
        for tag in tags {
            separated.push_bind(tag);
        }
        separated.push_unseparated("))");
    }
    if let Some(term) = &filters.q {
        push_and(qb, &mut first);
        push_search(qb, term);
    }
    if let Some(terms) = &filters.q_any {
        let terms: Vec<&str> = terms
            .iter()
            .map(|term| term.trim())
            .filter(|term| !term.is_empty())
            .collect();
        push_and(qb, &mut first);
        if terms.is_empty() {
            qb.push("0");
        } else {
            qb.push("(");
            for (index, term) in terms.iter().enumerate() {
                if index > 0 {
                    qb.push(" OR ");
                }
                qb.push("(");
                push_search(qb, term);
                let (numbers, ids) = exact_values(filters);
                if !numbers.is_empty() || !ids.is_empty() {
                    qb.push(" OR ");
                    push_exact(qb, filters);
                }
                qb.push(")");
            }
            qb.push(")");
        }
    }
    let exact_only = filters.q.is_none() && filters.q_any.is_none();
    if exact_only && (filters.number_exact.is_some() || filters.id_exact.is_some()) {
        push_and(qb, &mut first);
        if !push_exact(qb, filters) {
            qb.push("0");
        }
    }
    if let Some(title) = &filters.title {
        push_and(qb, &mut first);
        qb.push("ULOWER(tasks.title) LIKE ")
            .push_bind(format!("%{}%", title.to_lowercase()));
    }
    if let Some(title) = &filters.title_exact {
        push_and(qb, &mut first);
        qb.push("ULOWER(tasks.title) = ULOWER(")
            .push_bind(title.clone())
            .push(")");
    }
    if let Some(source_file) = &filters.source_file {
        push_and(qb, &mut first);
        qb.push("ULOWER(tasks.source_file) LIKE ")
            .push_bind(format!("%{}%", source_file.to_lowercase()));
    }
    if let Some(project_archived) = filters.project_archived {
        push_and(qb, &mut first);
        qb.push(if project_archived {
            "projects.archived_at IS NOT NULL"
        } else {
            "projects.archived_at IS NULL"
        });
    }
}

fn push_from(qb: &mut QueryBuilder<Sqlite>, filters: &TaskFilters) {
    if filters.include_project == Some(true) || filters.project_archived.is_some() {
        qb.push(" LEFT JOIN projects ON tasks.project_id = projects.id");
    }
    if filters.include_scope == Some(true) {
        qb.push(" LEFT JOIN scopes ON tasks.scope_id = scopes.id");
    }
}

fn push_order(qb: &mut QueryBuilder<Sqlite>, filters: &TaskFilters) {
    let order = if filters.descending() { "DESC" } else { "ASC" };
    let (numbers, ids) = exact_values(filters);
    qb.push(" ORDER BY ");
    if !numbers.is_empty() || !ids.is_empty() {
        qb.push("CASE WHEN ");
        push_exact(qb, filters);
        qb.push(" THEN 0 ELSE 1 END, ");
    }
    match filters.sort() {
        Sort::Priority => {
            qb.push(
				"CASE tasks.priority WHEN 'low' THEN 3 WHEN 'medium' THEN 2 WHEN 'high' THEN 1 WHEN 'critical' THEN 0 ELSE 99 END ",
			)
			.push(order)
			.push(", tasks.updated_at DESC, tasks.key ASC");
        }
        Sort::Status => {
            qb.push(
				"CASE tasks.status WHEN 'backlog' THEN 0 WHEN 'open' THEN 1 WHEN 'in-progress' THEN 2 WHEN 'blocked' THEN 3 WHEN 'done' THEN 4 WHEN 'cancelled' THEN 5 ELSE 99 END ",
			)
			.push(order)
			.push(", tasks.key ASC");
        }
        Sort::Project => {
            qb.push("(SELECT name FROM projects WHERE id = tasks.project_id) ")
                .push(order)
                .push(", tasks.number ASC, tasks.key ASC");
        }
        Sort::Number => {
            qb.push("tasks.number ")
                .push(order)
                .push(", tasks.project_id ASC, tasks.key ASC");
        }
        Sort::Title => {
            qb.push("ULOWER(tasks.title) ")
                .push(order)
                .push(", tasks.key ASC");
        }
        Sort::ClosedAt => {
            qb.push("(tasks.closed_at IS NULL) ASC, tasks.closed_at ")
                .push(order)
                .push(", tasks.key ASC");
        }
        Sort::CreatedAt => {
            qb.push("tasks.created_at ")
                .push(order)
                .push(", tasks.key ASC");
        }
        Sort::UpdatedAt => {
            qb.push("tasks.updated_at ")
                .push(order)
                .push(", tasks.key ASC");
        }
    }
}

fn row_to_task(row: TaskRow, tags: Vec<TagName>, blocking: BlockingInfo) -> Task {
    Task {
        id: TaskKey::from(row.key),
        project_id: ProjectId::from(row.project_id),
        number: Seq::from(row.number),
        title: row.title,
        description: Some(row.description),
        status: Status::from_db(&row.status).unwrap_or(Status::Backlog),
        priority: Priority::from_db(&row.priority).unwrap_or(Priority::Low),
        is_epic: row.is_epic == 1,
        epic_id: row.epic_key.map(TaskKey::from),
        scope_id: row.scope_id.map(ScopeId::from),
        source_file: row.source_file,
        tags,
        estimate: row.estimate.as_deref().and_then(Estimate::from_db),
        assignee: row.assignee,
        due_at: row.due_at,
        attachments_count: row.attachments_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
        closed_at: row.closed_at,
        closed_reason: row.closed_reason,
        blocked_reason: row.blocked_reason,
        deleted_at: row.deleted_at,
        project_name: row.project_name,
        scope_name: row.scope_name,
        short_description: None,
        blocked_by: blocking.blocked_by,
        blocks: blocking.blocks,
        relates_to: blocking.relates_to,
        duplicates: blocking.duplicates,
        duplicated_by: blocking.duplicated_by,
        children_counts: None,
    }
}

async fn tags_for_tasks(db: &Db, keys: &[String]) -> Result<HashMap<String, Vec<TagName>>> {
    let mut tags: HashMap<String, Vec<TagName>> = HashMap::new();
    if keys.is_empty() {
        return Ok(tags);
    }
    let mut qb = QueryBuilder::new(
        "SELECT tasks.key AS task_key, task_tags.tag FROM task_tags JOIN tasks ON tasks.id = task_tags.task_id WHERE tasks.key IN (",
    );
    let mut separated = qb.separated(", ");
    for key in keys {
        separated.push_bind(key.clone());
    }
    separated.push_unseparated(") ORDER BY task_tags.tag");
    let rows: Vec<(String, String)> = qb.build_query_as().fetch_all(db.pool()).await?;
    for (key, tag) in rows {
        tags.entry(key).or_default().push(TagName::from(tag));
    }
    Ok(tags)
}

pub(crate) async fn blocking_info_for(
    db: &Db,
    keys: &[String],
) -> Result<HashMap<String, BlockingInfo>> {
    let mut info: HashMap<String, BlockingInfo> = keys
        .iter()
        .map(|key| (key.clone(), BlockingInfo::default()))
        .collect();
    if keys.is_empty() {
        return Ok(info);
    }
    let mut qb = QueryBuilder::new(
        "SELECT l.link_type, source.key AS source_key, target.key AS target_key FROM task_links l JOIN tasks source ON source.id = l.source_task_id AND source.deleted_at IS NULL JOIN tasks target ON target.id = l.target_task_id AND target.deleted_at IS NULL WHERE target.key IN (",
    );
    let mut separated = qb.separated(", ");
    for key in keys {
        separated.push_bind(key.clone());
    }
    separated.push_unseparated(") OR source.key IN (");
    let mut separated = qb.separated(", ");
    for key in keys {
        separated.push_bind(key.clone());
    }
    separated.push_unseparated(")");
    let rows: Vec<(String, String, String)> = qb.build_query_as().fetch_all(db.pool()).await?;
    for (link_type, source, target) in rows {
        match link_type.as_str() {
            "blocks" => {
                if let Some(entry) = info.get_mut(&target) {
                    entry.blocked_by.push(TaskKey::from(source.clone()));
                }
                if let Some(entry) = info.get_mut(&source) {
                    entry.blocks.push(TaskKey::from(target.clone()));
                }
            }
            "relates_to" => {
                if let Some(entry) = info.get_mut(&source) {
                    entry.relates_to.push(TaskKey::from(target.clone()));
                }
                if let Some(entry) = info.get_mut(&target) {
                    entry.relates_to.push(TaskKey::from(source.clone()));
                }
            }
            "duplicates" => {
                if let Some(entry) = info.get_mut(&source) {
                    entry.duplicates.push(TaskKey::from(target.clone()));
                }
                if let Some(entry) = info.get_mut(&target) {
                    entry.duplicated_by.push(TaskKey::from(source.clone()));
                }
            }
            _ => {}
        }
    }
    for entry in info.values_mut() {
        entry.blocked_by.sort();
        entry.blocks.sort();
        entry.relates_to.sort();
        entry.duplicates.sort();
        entry.duplicated_by.sort();
    }
    Ok(info)
}

fn fields_of(filters: &TaskFilters) -> Option<Vec<String>> {
    parse_fields(filters.fields.as_deref())
}

fn parse_fields(fields: Option<&str>) -> Option<Vec<String>> {
    let fields = fields?;
    let mut parsed: Vec<String> = Vec::new();
    for field in fields.split(',') {
        let field = field.trim();
        if field.is_empty() || parsed.iter().any(|known| known.as_str() == field) {
            continue;
        }
        parsed.push(field.to_string());
    }
    if parsed.is_empty() {
        None
    } else {
        Some(parsed)
    }
}

fn pick_fields(task: Task, fields: Option<&[String]>) -> serde_json::Value {
    let Some(fields) = fields else {
        return serde_json::to_value(task).unwrap_or(serde_json::Value::Null);
    };
    let mut object = match serde_json::to_value(task) {
        Ok(serde_json::Value::Object(object)) => object,
        _ => return serde_json::Value::Null,
    };
    let requested: Vec<String> = fields
        .iter()
        .filter(|field| object.contains_key(*field))
        .cloned()
        .collect();
    if requested.is_empty() {
        return serde_json::Value::Object(object);
    }
    let mut picked = serde_json::Map::new();
    for field in &requested {
        if let Some(value) = object.remove(field) {
            picked.insert(field.clone(), value);
        }
    }
    for field in ["id", "project_id", "number"] {
        if !picked.contains_key(field)
            && let Some(value) = object.get(field)
        {
            picked.insert(field.to_string(), value.clone());
        }
    }
    serde_json::Value::Object(picked)
}

pub async fn list_tasks(db: &Db, filters: &TaskFilters) -> Result<TaskList> {
    filters.validate()?;
    list_tasks_unchecked(db, filters).await
}

pub(crate) async fn list_tasks_unchecked(db: &Db, filters: &TaskFilters) -> Result<TaskList> {
    let include_project = filters.include_project == Some(true);
    let include_scope = filters.include_scope == Some(true);
    let include_description = filters.include_description == Some(true)
        || fields_of(filters)
            .is_some_and(|fields| fields.iter().any(|field| field.as_str() == "description"));

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
        .push_bind(filters.limit())
        .push(" OFFSET ")
        .push_bind(filters.offset());

    let rows: Vec<TaskRow> = query.build_query_as().fetch_all(db.pool()).await?;
    let keys: Vec<String> = rows.iter().map(|row| row.key.clone()).collect();
    let mut tags = tags_for_tasks(db, &keys).await?;
    let mut blocking = blocking_info_for(db, &keys).await?;

    let fields = fields_of(filters);
    let items = rows
        .into_iter()
        .map(|row| {
            let key = row.key.clone();
            let mut task = row_to_task(
                row,
                tags.remove(&key).unwrap_or_default(),
                blocking.remove(&key).unwrap_or_default(),
            );
            if include_description {
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

    Ok(TaskList { items, total })
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
    let row: Option<TaskRow> = sqlx::query_as(
		"SELECT tasks.*, (SELECT key FROM tasks epic WHERE epic.id = tasks.epic_id) AS epic_key, (SELECT COUNT(*) FROM task_attachments a WHERE a.task_id = tasks.id AND a.deleted_at IS NULL) AS attachments_count, NULL AS project_name, NULL AS scope_name FROM tasks WHERE tasks.key = ?",
	)
	.bind(key)
	.fetch_optional(db.pool())
	.await?;
    let Some(row) = row else {
        return Ok(None);
    };
    let task_key = row.key.clone();
    let tags = tags_for_tasks(db, std::slice::from_ref(&task_key)).await?;
    let blocking = blocking_info_for(db, std::slice::from_ref(&task_key)).await?;
    Ok(Some(row_to_task(
        row,
        tags.get(&task_key).cloned().unwrap_or_default(),
        blocking.get(&task_key).cloned().unwrap_or_default(),
    )))
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

fn short_description(description: &str) -> String {
    let line = first_prose_line(description);
    let plain = plain_line(&line);
    if plain.chars().count() > 120 {
        let cut: String = plain.chars().take(120).collect();
        format!("{cut}…")
    } else {
        plain
    }
}

fn first_prose_line(description: &str) -> String {
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

fn plain_line(line: &str) -> String {
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
