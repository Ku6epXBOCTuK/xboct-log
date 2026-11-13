use crate::ids::TaskKey;
use crate::{AppError, Db, Result};

pub fn normalize_task_id_input(value: &str) -> String {
    if let Some((prefix, number)) = value.rsplit_once('-')
        && !number.is_empty()
        && number.chars().all(|character| character.is_ascii_digit())
    {
        return format!("{}-{number}", prefix.to_uppercase());
    }
    value.to_string()
}

fn is_bare_number(value: &str) -> bool {
    !value.is_empty() && value.chars().all(|character| character.is_ascii_digit())
}

async fn project_prefix(db: &Db, prefix: &str) -> Result<Option<(String, String)>> {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT id, prefix FROM projects WHERE id = ? OR prefix = ? COLLATE NOCASE LIMIT 1",
    )
    .bind(prefix)
    .bind(prefix)
    .fetch_optional(db.pool())
    .await?;
    Ok(row)
}

async fn near_task_keys(db: &Db, project_id: &str, number: i64) -> Result<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as(
		"SELECT key FROM tasks WHERE project_id = ? AND number BETWEEN ? AND ? AND deleted_at IS NULL ORDER BY ABS(number - ?) LIMIT 3",
	)
	.bind(project_id)
	.bind(number - 3)
	.bind(number + 3)
	.bind(number)
	.fetch_all(db.pool())
	.await?;
    Ok(rows.into_iter().map(|(key,)| key).collect())
}

async fn hint_for_full_id(db: &Db, id: &str) -> Result<Option<String>> {
    let Some((prefix, number)) = id.rsplit_once('-') else {
        return Ok(None);
    };
    if !is_bare_number(number) {
        return Ok(None);
    }
    let Ok(number) = number.parse::<i64>() else {
        return Ok(None);
    };
    let Some((project_id, _)) = project_prefix(db, prefix).await? else {
        let rows: Vec<(String,)> = sqlx::query_as("SELECT prefix FROM projects ORDER BY prefix")
            .fetch_all(db.pool())
            .await?;
        if rows.is_empty() {
            return Ok(None);
        }
        let known: Vec<String> = rows.into_iter().map(|(prefix,)| prefix).collect();
        return Ok(Some(format!(
            "unknown project prefix '{prefix}' (known: {})",
            known.join(", ")
        )));
    };
    let keys = near_task_keys(db, &project_id, number).await?;
    if keys.is_empty() {
        return Ok(None);
    }
    Ok(Some(format!("did you mean {}?", keys.join(" or "))))
}

async fn ids_by_number(db: &Db, number: i64, include_deleted: bool) -> Result<Vec<String>> {
    let sql = if include_deleted {
        "SELECT key FROM tasks WHERE number = ? ORDER BY project_id, key"
    } else {
        "SELECT key FROM tasks WHERE number = ? AND deleted_at IS NULL ORDER BY project_id, key"
    };
    let rows: Vec<(String,)> = sqlx::query_as(sql)
        .bind(number)
        .fetch_all(db.pool())
        .await?;
    Ok(rows.into_iter().map(|(key,)| key).collect())
}

async fn lookup_task_with(db: &Db, id: &str, include_deleted: bool) -> Result<Option<TaskKey>> {
    let normalized = normalize_task_id_input(id);
    let sql = if include_deleted {
        "SELECT key FROM tasks WHERE (key = ? OR key = ?) LIMIT 1"
    } else {
        "SELECT key FROM tasks WHERE (key = ? OR key = ?) AND deleted_at IS NULL LIMIT 1"
    };
    let row: Option<(String,)> = sqlx::query_as(sql)
        .bind(id)
        .bind(normalized)
        .fetch_optional(db.pool())
        .await?;
    Ok(row.map(|(key,)| TaskKey::from(key)))
}

async fn lookup_task(db: &Db, id: &str) -> Result<Option<TaskKey>> {
    lookup_task_with(db, id, false).await
}

pub async fn resolve_task_id_any(db: &Db, id: &str) -> Result<TaskKey> {
    let trimmed = id.trim();
    if is_bare_number(trimmed) {
        let number: i64 = trimmed
            .parse()
            .map_err(|error: std::num::ParseIntError| AppError::validation(error.to_string()))?;
        let candidates = ids_by_number(db, number, true).await?;
        if candidates.is_empty() {
            return Err(AppError::validation(format!(
                "task id must be 'PREFIX-NUMBER' - no task {number} in the backlog"
            )));
        }
        return Err(AppError::validation(format!(
            "task id must be 'PREFIX-NUMBER' - use {}",
            candidates.join(", ")
        )));
    }
    if let Some(key) = lookup_task_with(db, trimmed, true).await? {
        return Ok(key);
    }
    let hint = hint_for_full_id(db, trimmed).await?;
    let message = match hint {
        Some(hint) => format!("task {trimmed} not found - {hint}"),
        None => format!("task {trimmed} not found"),
    };
    Err(AppError::not_found(message))
}

pub async fn resolve_task_id(db: &Db, id: &str) -> Result<TaskKey> {
    let trimmed = id.trim();
    if is_bare_number(trimmed) {
        let number: i64 = trimmed
            .parse()
            .map_err(|error: std::num::ParseIntError| AppError::validation(error.to_string()))?;
        let candidates = ids_by_number(db, number, false).await?;
        if candidates.is_empty() {
            return Err(AppError::validation(format!(
                "task id must be 'PREFIX-NUMBER' - no task {number} in the backlog"
            )));
        }
        return Err(AppError::validation(format!(
            "task id must be 'PREFIX-NUMBER' - use {}",
            candidates.join(", ")
        )));
    }
    if let Some(key) = lookup_task(db, trimmed).await? {
        return Ok(key);
    }
    let hint = hint_for_full_id(db, trimmed).await?;
    let message = match hint {
        Some(hint) => format!("task {trimmed} not found - {hint}"),
        None => format!("task {trimmed} not found"),
    };
    Err(AppError::not_found(message))
}

async fn epic_candidates(db: &Db, number: i64, project_id: &str) -> Result<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT key FROM tasks WHERE number = ? AND project_id = ? AND deleted_at IS NULL ORDER BY key",
    )
    .bind(number)
    .bind(project_id)
    .fetch_all(db.pool())
    .await?;
    Ok(rows.into_iter().map(|(key,)| key).collect())
}

pub async fn resolve_epic_id(
    db: &Db,
    id: &str,
    project_id: &str,
    self_key: Option<&str>,
) -> Result<TaskKey> {
    let trimmed = id.trim();
    let key = if is_bare_number(trimmed) {
        let number: i64 = trimmed
            .parse()
            .map_err(|error: std::num::ParseIntError| AppError::validation(error.to_string()))?;
        let candidates = epic_candidates(db, number, project_id).await?;
        match candidates.len() {
            0 => {
                return Err(AppError::validation(format!(
                    "epic id must be 'PREFIX-NUMBER' - no epic {number} in project {project_id}"
                )));
            }
            1 => TaskKey::from(candidates[0].clone()),
            _ => {
                return Err(AppError::validation(format!(
                    "epic id must be 'PREFIX-NUMBER' - use {}",
                    candidates.join(", ")
                )));
            }
        }
    } else {
        lookup_task(db, trimmed)
            .await?
            .ok_or_else(|| AppError::not_found(format!("epic {trimmed} not found")))?
    };

    if let Some(self_key) = self_key
        && self_key == key.as_str()
    {
        return Err(AppError::validation("a task cannot be its own epic"));
    }

    let row: Option<(String, i64)> = sqlx::query_as(
        "SELECT project_id, is_epic FROM tasks WHERE key = ? AND deleted_at IS NULL",
    )
    .bind(key.as_str())
    .fetch_optional(db.pool())
    .await?;
    let Some((epic_project, is_epic)) = row else {
        return Err(AppError::not_found(format!("epic {trimmed} not found")));
    };
    if is_epic != 1 {
        return Err(AppError::validation(format!(
            "{} is not an epic",
            key.as_str()
        )));
    }
    if epic_project != project_id {
        return Err(AppError::validation("epic must belong to the same project"));
    }

    if let Some(self_key) = self_key {
        let mut cursor = Some(key.clone());
        let mut hops = 0;
        while let Some(current) = cursor {
            if current.as_str() == self_key {
                return Err(AppError::validation(
                    "setting this epic would create a cycle",
                ));
            }
            hops += 1;
            if hops > 64 {
                break;
            }
            let parent: Option<(Option<String>,)> = sqlx::query_as(
                "SELECT (SELECT key FROM tasks parent WHERE parent.id = tasks.epic_id) FROM tasks WHERE key = ?",
            )
            .bind(current.as_str())
            .fetch_optional(db.pool())
            .await?;
            cursor = parent.and_then(|(parent,)| parent).map(TaskKey::from);
        }
    }
    Ok(key)
}

async fn scope_by_name(db: &Db, project_id: &str, name: &str) -> Result<Option<i64>> {
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM scopes WHERE project_id = ? AND name = ? COLLATE NOCASE LIMIT 1",
    )
    .bind(project_id)
    .bind(name)
    .fetch_optional(db.pool())
    .await?;
    Ok(row.map(|(id,)| id))
}

async fn scope_choices(db: &Db, project_id: &str) -> Result<String> {
    let rows: Vec<(i64, String)> =
        sqlx::query_as("SELECT id, name FROM scopes WHERE project_id = ? ORDER BY name")
            .bind(project_id)
            .fetch_all(db.pool())
            .await?;
    if rows.is_empty() {
        return Ok(format!(
            "project {project_id} has no scopes: create one with scopes_create {{project_id: \"{project_id}\", name}}."
        ));
    }
    let listed: Vec<String> = rows
        .iter()
        .map(|(id, name)| format!("{name} ({id})"))
        .collect();
    Ok(format!(
        "Scopes of {project_id}: {}. See scopes_list {{project_id: \"{project_id}\"}} or create one with scopes_create {{project_id, name}}.",
        listed.join(", ")
    ))
}

async fn validate_scope(db: &Db, scope_id: i64, project_id: &str) -> Result<()> {
    let row: Option<(String,)> = sqlx::query_as("SELECT project_id FROM scopes WHERE id = ?")
        .bind(scope_id)
        .fetch_optional(db.pool())
        .await?;
    let Some((scope_project,)) = row else {
        return Err(AppError::validation(format!("scope {scope_id} not found")));
    };
    if scope_project != project_id {
        return Err(AppError::validation(
            "scope must belong to the same project",
        ));
    }
    Ok(())
}

pub async fn resolve_scope_ref(
    db: &Db,
    scope_id: Option<i64>,
    scope: Option<Option<&str>>,
    project_id: &str,
) -> Result<Option<i64>> {
    if let Some(id) = scope_id
        && scope == Some(None)
    {
        return Err(AppError::validation(format!(
            "scope is null, scope_id is {id}"
        )));
    }
    let name = scope.flatten().map(str::trim);
    let mut resolved = None;
    if let Some(name) = name {
        if name.is_empty() {
            return Err(AppError::validation(
                "scope name is empty: pass null to clear the scope, or the name of a scope of the project",
            ));
        }
        let found = scope_by_name(db, project_id, name).await?;
        let Some(id) = found else {
            return Err(AppError::validation(format!(
                "unknown scope \"{name}\" in project {project_id}. {}",
                scope_choices(db, project_id).await?
            )));
        };
        if let Some(explicit) = scope_id
            && explicit != id
        {
            return Err(AppError::validation(format!(
                "scope and scope_id disagree: scope \"{name}\" is scope {id}, scope_id is {explicit}"
            )));
        }
        resolved = Some(id);
    }
    let chosen = resolved.or(scope_id);
    if let Some(id) = chosen {
        validate_scope(db, id, project_id).await?;
    }
    Ok(chosen)
}
