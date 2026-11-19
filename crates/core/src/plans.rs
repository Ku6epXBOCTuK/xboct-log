use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::{AppError, Db, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum PlanStatus {
    Backlog,
    Active,
    Done,
    Cancelled,
}

impl PlanStatus {
    pub const ALL: [Self; 4] = [Self::Backlog, Self::Active, Self::Done, Self::Cancelled];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Backlog => "backlog",
            Self::Active => "active",
            Self::Done => "done",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|status| status.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct Plan {
    pub id: String,
    pub name: String,
    pub description: String,
    pub status: PlanStatus,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, JsonSchema)]
pub struct PlanCounts {
    pub tasks: i64,
    pub epics: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct PlanRef {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct PlanWithCounts {
    #[serde(flatten)]
    pub plan: Plan,
    pub tasks_count: i64,
    pub epics_count: i64,
}

impl PlanWithCounts {
    pub fn new(plan: Plan, counts: PlanCounts) -> Self {
        Self {
            plan,
            tasks_count: counts.tasks,
            epics_count: counts.epics,
        }
    }
}

#[derive(Debug, Default, Clone, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PlanPatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub status: Option<PlanStatus>,
}

fn row_to_plan(row: &sqlx::sqlite::SqliteRow) -> Result<Plan> {
    let status: String = row.get("status");
    Ok(Plan {
        id: row.get("id"),
        name: row.get("name"),
        description: row.get("description"),
        status: PlanStatus::from_db(&status).ok_or_else(|| {
            AppError::unexpected(format!(
                "plan {} has unknown status {status}",
                row.get::<String, _>("id")
            ))
        })?,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        closed_at: row.get("closed_at"),
        deleted_at: row.get("deleted_at"),
    })
}

pub async fn get_plan(db: &Db, id: &str) -> Result<Option<Plan>> {
    let row = sqlx::query("SELECT * FROM plans WHERE id = ?")
        .bind(id)
        .fetch_optional(db.pool())
        .await?;
    row.as_ref().map(row_to_plan).transpose()
}

pub async fn require_plan(db: &Db, id: &str) -> Result<Plan> {
    get_plan(db, id)
        .await?
        .ok_or_else(|| AppError::not_found(format!("plan {id} not found")))
}

pub async fn list_plans(db: &Db) -> Result<Vec<Plan>> {
    let rows = sqlx::query("SELECT * FROM plans WHERE deleted_at IS NULL ORDER BY name, id")
        .fetch_all(db.pool())
        .await?;
    rows.iter().map(row_to_plan).collect()
}

pub async fn list_deleted_plans(db: &Db) -> Result<Vec<Plan>> {
    let rows =
        sqlx::query("SELECT * FROM plans WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC")
            .fetch_all(db.pool())
            .await?;
    rows.iter().map(row_to_plan).collect()
}

pub async fn count_plan_items(db: &Db) -> Result<BTreeMap<String, PlanCounts>> {
    let rows = sqlx::query(
        "SELECT pi.plan_id,
            SUM(CASE WHEN t.is_epic = 0 THEN 1 ELSE 0 END) AS tasks,
            SUM(CASE WHEN t.is_epic = 1 THEN 1 ELSE 0 END) AS epics
         FROM plan_items pi
         JOIN tasks t ON t.id = pi.task_id
         WHERE t.deleted_at IS NULL
         GROUP BY pi.plan_id",
    )
    .fetch_all(db.pool())
    .await?;
    let mut counts = BTreeMap::new();
    for row in rows {
        counts.insert(
            row.get::<String, _>("plan_id"),
            PlanCounts {
                tasks: row.get("tasks"),
                epics: row.get("epics"),
            },
        );
    }
    Ok(counts)
}

pub async fn plan_counts(db: &Db, id: &str) -> Result<PlanCounts> {
    let row = sqlx::query(
        "SELECT
            COALESCE(SUM(CASE WHEN t.is_epic = 0 THEN 1 ELSE 0 END), 0) AS tasks,
            COALESCE(SUM(CASE WHEN t.is_epic = 1 THEN 1 ELSE 0 END), 0) AS epics
         FROM plan_items pi
         JOIN tasks t ON t.id = pi.task_id
         WHERE pi.plan_id = ? AND t.deleted_at IS NULL",
    )
    .bind(id)
    .fetch_one(db.pool())
    .await?;
    Ok(PlanCounts {
        tasks: row.get("tasks"),
        epics: row.get("epics"),
    })
}

pub async fn create_plan(
    db: &Db,
    name: &str,
    description: &str,
    status: PlanStatus,
) -> Result<Plan> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::validation("plan name is required"));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let now = crate::tasks::now_iso();
    let closed_at = if status == PlanStatus::Done {
        Some(now.clone())
    } else {
        None
    };
    sqlx::query(
        "INSERT INTO plans (id, name, description, status, created_at, updated_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(description.trim())
    .bind(status.as_str())
    .bind(&now)
    .bind(&now)
    .bind(closed_at)
    .execute(db.pool())
    .await?;
    require_plan(db, &id).await
}

pub async fn update_plan(
    db: &Db,
    id: &str,
    patch: &PlanPatch,
    expected_updated_at: Option<&str>,
) -> Result<Plan> {
    let current = require_plan(db, id).await?;
    if current.deleted_at.is_some() {
        return Err(AppError::not_found(format!("plan {id} not found")));
    }
    if let Some(expected) = expected_updated_at
        && expected != current.updated_at
    {
        return Err(AppError::conflict(format!(
            "plan {id} changed since {expected}"
        )));
    }

    let name = match &patch.name {
        Some(raw) => {
            let name = raw.trim();
            if name.is_empty() {
                return Err(AppError::validation("plan name is required"));
            }
            name.to_string()
        }
        None => current.name.clone(),
    };
    let description = match &patch.description {
        Some(raw) => raw.trim().to_string(),
        None => current.description.clone(),
    };
    let status = patch.status.unwrap_or(current.status);
    let now = crate::tasks::now_iso();
    let closed_at = match status {
        PlanStatus::Done => Some(current.closed_at.unwrap_or_else(|| now.clone())),
        _ => None,
    };

    sqlx::query(
        "UPDATE plans SET name = ?, description = ?, status = ?, closed_at = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(name)
    .bind(description)
    .bind(status.as_str())
    .bind(closed_at)
    .bind(&now)
    .bind(id)
    .execute(db.pool())
    .await?;
    require_plan(db, id).await
}

pub async fn delete_plan(db: &Db, id: &str) -> Result<Plan> {
    let current = require_plan(db, id).await?;
    if current.deleted_at.is_some() {
        return Ok(current);
    }
    let now = crate::tasks::now_iso();
    sqlx::query("UPDATE plans SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&now)
        .bind(id)
        .execute(db.pool())
        .await?;
    require_plan(db, id).await
}

pub async fn restore_plan(db: &Db, id: &str) -> Result<Plan> {
    let current = require_plan(db, id).await?;
    if current.deleted_at.is_none() {
        return Ok(current);
    }
    let now = crate::tasks::now_iso();
    sqlx::query("UPDATE plans SET deleted_at = NULL, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(id)
        .execute(db.pool())
        .await?;
    require_plan(db, id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn open() -> Db {
        let db = Db::open(":memory:").await.expect("open");
        db.migrate().await.expect("migrate");
        sqlx::query("INSERT INTO projects (id, prefix, name, created_at) VALUES ('log', 'LOG', 'Log', '2026-01-01T00:00:00.000Z')")
            .execute(db.pool())
            .await
            .expect("project");
        db
    }

    #[test]
    fn statuses_round_trip() {
        for status in PlanStatus::ALL {
            assert_eq!(PlanStatus::from_db(status.as_str()), Some(status));
        }
        assert_eq!(PlanStatus::from_db("open"), None);
    }

    #[tokio::test]
    async fn creates_updates_and_soft_deletes_a_plan() {
        let db = open().await;
        let plan = create_plan(&db, "  Roadmap  ", "  notes  ", PlanStatus::Backlog)
            .await
            .expect("create");
        assert_eq!(plan.name, "Roadmap");
        assert_eq!(plan.description, "notes");
        assert_eq!(plan.status, PlanStatus::Backlog);
        assert!(plan.closed_at.is_none());
        assert_eq!(list_plans(&db).await.expect("list").len(), 1);

        let fresh = update_plan(
            &db,
            &plan.id,
            &PlanPatch {
                status: Some(PlanStatus::Done),
                ..PlanPatch::default()
            },
            Some(&plan.updated_at),
        )
        .await
        .expect("update");
        assert_eq!(fresh.status, PlanStatus::Done);
        assert!(fresh.closed_at.is_some());

        let stale = update_plan(&db, &plan.id, &PlanPatch::default(), Some(&plan.updated_at))
            .await
            .expect_err("stale update");
        assert_eq!(stale.kind(), crate::AppErrorKind::Conflict);

        delete_plan(&db, &plan.id).await.expect("delete");
        assert!(list_plans(&db).await.expect("list").is_empty());
        assert_eq!(list_deleted_plans(&db).await.expect("deleted").len(), 1);

        restore_plan(&db, &plan.id).await.expect("restore");
        assert_eq!(list_plans(&db).await.expect("list").len(), 1);
        assert!(list_deleted_plans(&db).await.expect("deleted").is_empty());
    }

    #[tokio::test]
    async fn counts_tasks_and_epics_separately() {
        let db = open().await;
        let plan = create_plan(&db, "Release", "", PlanStatus::Active)
            .await
            .expect("create");
        for (index, (key, is_epic)) in [("LOG-1", 0), ("LOG-2", 0), ("LOG-3", 1)]
            .into_iter()
            .enumerate()
        {
            sqlx::query(
                "INSERT INTO tasks (id, project_id, number, is_epic, key, title, status, priority, created_at, updated_at)
                 VALUES (?, 'log', ?, ?, ?, 't', 'backlog', 'medium', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
            )
            .bind(key)
            .bind(index as i64 + 1)
            .bind(is_epic)
            .bind(key)
            .execute(db.pool())
            .await
            .expect("task");
            sqlx::query("INSERT INTO plan_items (plan_id, task_id, position) VALUES (?, ?, ?)")
                .bind(&plan.id)
                .bind(key)
                .bind(1024)
                .execute(db.pool())
                .await
                .expect("item");
        }
        let counts = plan_counts(&db, &plan.id).await.expect("counts");
        assert_eq!(counts.tasks, 2);
        assert_eq!(counts.epics, 1);
        assert_eq!(
            count_plan_items(&db)
                .await
                .expect("all counts")
                .get(&plan.id),
            Some(&counts)
        );

        let empty = create_plan(&db, "Empty", "", PlanStatus::Backlog)
            .await
            .expect("empty plan");
        assert_eq!(
            plan_counts(&db, &empty.id).await.expect("empty counts"),
            PlanCounts::default()
        );
    }
}
