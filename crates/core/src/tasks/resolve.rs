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

async fn ids_by_number(db: &Db, number: i64) -> Result<Vec<String>> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT key FROM tasks WHERE number = ? AND deleted_at IS NULL ORDER BY project_id, key",
    )
    .bind(number)
    .fetch_all(db.pool())
    .await?;
    Ok(rows.into_iter().map(|(key,)| key).collect())
}

async fn lookup_task(db: &Db, id: &str) -> Result<Option<String>> {
    let normalized = normalize_task_id_input(id);
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT key FROM tasks WHERE (key = ? OR key = ?) AND deleted_at IS NULL LIMIT 1",
    )
    .bind(id)
    .bind(normalized)
    .fetch_optional(db.pool())
    .await?;
    Ok(row.map(|(key,)| key))
}

pub async fn resolve_task_id(db: &Db, id: &str) -> Result<String> {
    let trimmed = id.trim();
    if is_bare_number(trimmed) {
        let number: i64 = trimmed
            .parse()
            .map_err(|error: std::num::ParseIntError| AppError::validation(error.to_string()))?;
        let candidates = ids_by_number(db, number).await?;
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
