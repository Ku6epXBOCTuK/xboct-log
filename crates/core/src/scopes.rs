use schemars::JsonSchema;

use std::collections::BTreeMap;

use serde::Serialize;
use sqlx::{FromRow, Row, sqlite::SqliteRow};

use crate::fetch::fetch_by_id;
use crate::ids::{ProjectId, ScopeId, TaskKey};
use crate::tasks::Status;
use crate::{AppError, Db, Result};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct Scope {
    pub id: ScopeId,
    pub project_id: ProjectId,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct ScopeCounts {
    pub tasks: i64,
    pub active_tasks: i64,
    pub epics: i64,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ScopeWithCounts {
    #[serde(flatten)]
    pub scope: Scope,
    pub task_count: i64,
    pub tasks_total: i64,
    pub epics_count: i64,
}

impl ScopeWithCounts {
    pub fn new(scope: Scope, counts: ScopeCounts) -> Self {
        Self {
            scope,
            task_count: counts.active_tasks,
            tasks_total: counts.tasks,
            epics_count: counts.epics,
        }
    }
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct ScopeDeleteReport {
    pub scope: Scope,
    pub task_ids: Vec<TaskKey>,
    pub epic_ids: Vec<TaskKey>,
    pub dry_run: bool,
}

impl<'r> FromRow<'r, SqliteRow> for Scope {
    fn from_row(row: &'r SqliteRow) -> sqlx::Result<Self> {
        Ok(Scope {
            id: ScopeId::new(row.get::<i64, _>("id")),
            project_id: ProjectId::new(row.get::<String, _>("project_id")),
            name: row.get("name"),
            created_at: row.get("created_at"),
        })
    }
}

pub async fn get_scope(db: &Db, id: ScopeId) -> Result<Option<Scope>> {
    fetch_by_id(
        sqlx::query("SELECT * FROM scopes WHERE id = ?").bind(id.get()),
        db.pool(),
    )
    .await
}

pub async fn list_scopes(db: &Db, project_id: Option<&ProjectId>) -> Result<Vec<Scope>> {
    let rows = match project_id {
        None => {
            sqlx::query_as::<_, Scope>("SELECT * FROM scopes ORDER BY project_id, name")
                .fetch_all(db.pool())
                .await?
        }
        Some(project_id) => {
            sqlx::query_as::<_, Scope>(
                "SELECT * FROM scopes WHERE project_id = ? COLLATE NOCASE ORDER BY name",
            )
            .bind(project_id.as_str())
            .fetch_all(db.pool())
            .await?
        }
    };
    Ok(rows)
}

pub async fn find_scope_by_name(
    db: &Db,
    project_id: &ProjectId,
    name: &str,
) -> Result<Option<Scope>> {
    fetch_by_id(
        sqlx::query(
            "SELECT * FROM scopes WHERE project_id = ? AND lower(name) = lower(?) ORDER BY id LIMIT 1",
        )
        .bind(project_id.as_str())
        .bind(name.trim()),
        db.pool(),
    )
    .await
}

pub async fn scoped_project_ids(db: &Db) -> Result<Vec<ProjectId>> {
    let rows: Vec<String> = sqlx::query_scalar("SELECT DISTINCT project_id FROM scopes")
        .fetch_all(db.pool())
        .await?;
    Ok(rows.into_iter().map(ProjectId::new).collect())
}

pub async fn count_tasks_by_scope(
    db: &Db,
    project_id: Option<&ProjectId>,
) -> Result<BTreeMap<i64, ScopeCounts>> {
    let active = Status::ACTIVE;
    let slots = vec!["?"; active.len()].join(", ");
    let mut sql = format!(
        "SELECT scope_id,
            SUM(CASE WHEN is_epic = 0 THEN 1 ELSE 0 END) AS tasks,
            SUM(CASE WHEN is_epic = 0 AND status IN ({slots}) THEN 1 ELSE 0 END) AS active_tasks,
            SUM(CASE WHEN is_epic = 1 THEN 1 ELSE 0 END) AS epics
         FROM tasks
         WHERE scope_id IS NOT NULL AND deleted_at IS NULL"
    );
    if project_id.is_some() {
        sql.push_str(" AND project_id = ? COLLATE NOCASE");
    }
    sql.push_str(" GROUP BY scope_id");

    let mut query = sqlx::query(sqlx::AssertSqlSafe(sql));
    for status in active {
        query = query.bind(status.as_str());
    }
    if let Some(project_id) = project_id {
        query = query.bind(project_id.as_str());
    }

    let rows = query.fetch_all(db.pool()).await?;
    let mut counts = BTreeMap::new();
    for row in rows {
        counts.insert(
            row.get::<i64, _>("scope_id"),
            ScopeCounts {
                tasks: row.get("tasks"),
                active_tasks: row.get("active_tasks"),
                epics: row.get("epics"),
            },
        );
    }
    Ok(counts)
}

async fn name_conflict(
    db: &Db,
    project_id: &ProjectId,
    name: &str,
    except: Option<ScopeId>,
) -> Result<bool> {
    let row: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM scopes WHERE project_id = ? AND name = ? AND id IS NOT ?",
    )
    .bind(project_id.as_str())
    .bind(name)
    .bind(except.map(ScopeId::get))
    .fetch_optional(db.pool())
    .await?;
    Ok(row.is_some())
}

pub async fn create_scope(db: &Db, project_id: &ProjectId, name: &str) -> Result<Scope> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::validation("scope name is required"));
    }
    let Some(project) = crate::projects::get_project(db, project_id.as_str()).await? else {
        return Err(AppError::not_found(format!(
            "project {project_id} not found"
        )));
    };
    if name_conflict(db, &project.id, &name, None).await? {
        return Err(AppError::conflict(format!(
            "scope \"{name}\" already exists"
        )));
    }

    let result = sqlx::query("INSERT INTO scopes (project_id, name, created_at) VALUES (?, ?, ?)")
        .bind(project.id.as_str())
        .bind(&name)
        .bind(crate::tasks::now_iso())
        .execute(db.pool())
        .await?;

    get_scope(db, ScopeId::new(result.last_insert_rowid()))
        .await?
        .ok_or_else(|| AppError::unexpected(format!("scope {name} disappeared after insert")))
}

pub async fn update_scope(db: &Db, id: ScopeId, name: Option<&str>) -> Result<Scope> {
    let Some(current) = get_scope(db, id).await? else {
        return Err(AppError::not_found(format!("scope {id} not found")));
    };
    let Some(raw_name) = name else {
        return Ok(current);
    };

    let name = raw_name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::validation("scope name is required"));
    }
    if name_conflict(db, &current.project_id, &name, Some(id)).await? {
        return Err(AppError::conflict(format!(
            "scope \"{name}\" already exists"
        )));
    }

    sqlx::query("UPDATE scopes SET name = ? WHERE id = ?")
        .bind(&name)
        .bind(id.get())
        .execute(db.pool())
        .await?;

    get_scope(db, id)
        .await?
        .ok_or_else(|| AppError::unexpected(format!("scope {id} disappeared after update")))
}

async fn scope_members(
    connection: &mut sqlx::SqliteConnection,
    id: ScopeId,
) -> Result<(Vec<TaskKey>, Vec<TaskKey>)> {
    let rows = sqlx::query(
        "SELECT key, is_epic FROM tasks WHERE scope_id = ? AND deleted_at IS NULL ORDER BY key",
    )
    .bind(id.get())
    .fetch_all(&mut *connection)
    .await?;

    let mut task_ids = Vec::new();
    let mut epic_ids = Vec::new();
    for row in rows {
        let key = TaskKey::new(row.get::<String, _>("key"));
        if row.get::<i64, _>("is_epic") == 0 {
            task_ids.push(key);
        } else {
            epic_ids.push(key);
        }
    }
    Ok((task_ids, epic_ids))
}

pub async fn preview_scope_delete(db: &Db, id: ScopeId) -> Result<ScopeDeleteReport> {
    let Some(scope) = get_scope(db, id).await? else {
        return Err(AppError::not_found(format!("scope {id} not found")));
    };
    let mut connection = db.pool().acquire().await?;
    let (task_ids, epic_ids) = scope_members(&mut connection, id).await?;
    Ok(ScopeDeleteReport {
        scope,
        task_ids,
        epic_ids,
        dry_run: true,
    })
}

pub async fn delete_scope_detailed(db: &Db, id: ScopeId) -> Result<ScopeDeleteReport> {
    let Some(scope) = get_scope(db, id).await? else {
        return Err(AppError::not_found(format!("scope {id} not found")));
    };

    let mut tx = db.begin().await?;
    let (task_ids, epic_ids) = scope_members(&mut tx, id).await?;
    sqlx::query("UPDATE tasks SET scope_id = NULL WHERE scope_id = ?")
        .bind(id.get())
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM scopes WHERE id = ?")
        .bind(id.get())
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    Ok(ScopeDeleteReport {
        scope,
        task_ids,
        epic_ids,
        dry_run: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_serialize_flat() {
        let scope = Scope {
            id: ScopeId::new(3),
            project_id: ProjectId::new("log"),
            name: "release".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        };
        let value = serde_json::to_value(ScopeWithCounts::new(
            scope,
            ScopeCounts {
                tasks: 3,
                active_tasks: 2,
                epics: 1,
            },
        ))
        .unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "id": 3,
                "project_id": "log",
                "name": "release",
                "created_at": "2026-01-01T00:00:00.000Z",
                "task_count": 2,
                "tasks_total": 3,
                "epics_count": 1
            })
        );
    }
}
