use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Row, sqlite::SqliteRow};

use crate::{
    AppError, Db, PlanKey, Result, Tx,
    fetch::{fetch_by_id, unexpected},
};

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
    pub key: String,
    pub number: i64,
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
    pub closed_tasks: i64,
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
    pub closed_tasks_count: i64,
}

impl PlanWithCounts {
    pub fn new(plan: Plan, counts: PlanCounts) -> Self {
        Self {
            plan,
            tasks_count: counts.tasks,
            epics_count: counts.epics,
            closed_tasks_count: counts.closed_tasks,
        }
    }
}

#[derive(Debug, Default, Clone, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PlanPatch {
    #[serde(default)]
    #[schemars(description = "Short plan id in 'PL-NUMBER' form, e.g. 'PL-1'. Must be unique.")]
    pub key: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub status: Option<PlanStatus>,
}

impl<'r> FromRow<'r, SqliteRow> for Plan {
    fn from_row(row: &'r SqliteRow) -> sqlx::Result<Self> {
        let status: String = row.get("status");
        Ok(Plan {
            id: row.get("id"),
            key: row.get("key"),
            number: row.get("number"),
            name: row.get("name"),
            description: row.get("description"),
            status: PlanStatus::from_db(&status).ok_or_else(|| {
                unexpected(format!(
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
}

macro_rules! plan_row {
    ($($tail:literal)*) => {
        concat!(
            "SELECT p.id, COALESCE(pk.key, 'PL-0') AS key, COALESCE(pk.number, 0) AS number, ",
            "p.name, p.description, p.status, p.created_at, p.updated_at, p.closed_at, p.deleted_at ",
            "FROM plans p LEFT JOIN plan_keys pk ON pk.plan_id = p.id",
            $($tail)*
        )
    };
}

pub async fn get_plan_by_key(db: &Db, key: &str) -> Result<Option<Plan>> {
    fetch_by_id(
        sqlx::query(plan_row!(" WHERE pk.key = ?")).bind(key),
        db.pool(),
    )
    .await
}

pub async fn resolve_plan_id(db: &Db, id: &str) -> Result<String> {
    let raw = id.trim();
    if let Ok(uuid) = uuid::Uuid::parse_str(raw) {
        return Ok(uuid.hyphenated().to_string());
    }
    let key = match PlanKey::parse(raw) {
        Ok(key) => key,
        Err(error) => {
            let existing: Option<String> = sqlx::query_scalar("SELECT id FROM plans WHERE id = ?")
                .bind(raw)
                .fetch_optional(db.pool())
                .await?;
            return existing.ok_or(error);
        }
    };
    let plan = get_plan_by_key(db, key.as_str())
        .await?
        .ok_or_else(|| AppError::not_found(format!("plan {key} not found")))?;
    Ok(plan.id)
}

pub async fn get_plan(db: &Db, id: &str) -> Result<Option<Plan>> {
    let id = resolve_plan_id(db, id).await?;
    fetch_by_id(
        sqlx::query(plan_row!(" WHERE p.id = ?")).bind(id),
        db.pool(),
    )
    .await
}

pub async fn require_plan(db: &Db, id: &str) -> Result<Plan> {
    get_plan(db, id)
        .await?
        .ok_or_else(|| AppError::not_found(format!("plan {id} not found")))
}

pub async fn list_plans(db: &Db) -> Result<Vec<Plan>> {
    let rows = sqlx::query_as::<_, Plan>(plan_row!(
        " WHERE p.deleted_at IS NULL ORDER BY p.name, p.id"
    ))
    .fetch_all(db.pool())
    .await?;
    Ok(rows)
}

pub async fn list_deleted_plans(db: &Db) -> Result<Vec<Plan>> {
    let rows = sqlx::query_as::<_, Plan>(plan_row!(
        " WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC"
    ))
    .fetch_all(db.pool())
    .await?;
    Ok(rows)
}

pub async fn count_plan_items(db: &Db) -> Result<BTreeMap<String, PlanCounts>> {
    let rows = sqlx::query(
        "SELECT pi.plan_id,
            SUM(CASE WHEN t.is_epic = 0 THEN 1 ELSE 0 END) AS tasks,
            SUM(CASE WHEN t.is_epic = 1 THEN 1 ELSE 0 END) AS epics,
            SUM(CASE WHEN t.is_epic = 0 AND t.status IN ('done', 'cancelled') THEN 1 ELSE 0 END) AS closed_tasks
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
                closed_tasks: row.get("closed_tasks"),
            },
        );
    }
    Ok(counts)
}

pub async fn plan_counts(db: &Db, id: &str) -> Result<PlanCounts> {
    let id = resolve_plan_id(db, id).await?;
    let row = sqlx::query(
        "SELECT
            COALESCE(SUM(CASE WHEN t.is_epic = 0 THEN 1 ELSE 0 END), 0) AS tasks,
            COALESCE(SUM(CASE WHEN t.is_epic = 1 THEN 1 ELSE 0 END), 0) AS epics,
            COALESCE(SUM(CASE WHEN t.is_epic = 0 AND t.status IN ('done', 'cancelled') THEN 1 ELSE 0 END), 0) AS closed_tasks
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
        closed_tasks: row.get("closed_tasks"),
    })
}

async fn allocate_number_tx(tx: &mut Tx) -> Result<i64> {
    let (high, used): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE((SELECT last_number FROM plan_number_high_water WHERE singleton = 1), 0),
                COALESCE((SELECT MAX(number) FROM plan_keys), 0)",
    )
    .fetch_one(&mut **tx)
    .await?;
    let next = high.max(used) + 1;
    bump_number_tx(tx, next).await?;
    Ok(next)
}

async fn bump_number_tx(tx: &mut Tx, number: i64) -> Result<()> {
    sqlx::query(
        "INSERT INTO plan_number_high_water (singleton, last_number) VALUES (1, ?)
         ON CONFLICT (singleton) DO UPDATE SET last_number = MAX(last_number, excluded.last_number)",
    )
    .bind(number)
    .execute(&mut **tx)
    .await?;
    Ok(())
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
    let mut tx = db.begin().await?;
    let number = allocate_number_tx(&mut tx).await?;
    let key = format!("{}-{}", PlanKey::PREFIX, number);
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
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO plan_keys (plan_id, key, number) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&key)
        .bind(number)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    require_plan(db, &id).await
}

pub async fn update_plan(
    db: &Db,
    id: &str,
    patch: &PlanPatch,
    expected_updated_at: Option<&str>,
) -> Result<Plan> {
    let id = resolve_plan_id(db, id).await?;
    let current = require_plan(db, &id).await?;
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

    let mut tx = db.begin().await?;
    let (key, number) = match &patch.key {
        Some(raw) => {
            let parsed = PlanKey::parse(raw)?;
            if parsed.as_str() != current.key {
                let taken: Option<String> = sqlx::query_scalar(
                    "SELECT plan_id FROM plan_keys WHERE key = ? AND plan_id <> ?",
                )
                .bind(parsed.as_str())
                .bind(&current.id)
                .fetch_optional(&mut *tx)
                .await?;
                if taken.is_some() {
                    return Err(AppError::conflict(format!(
                        "plan key {} already in use",
                        parsed.as_str()
                    )));
                }
            }
            let number = parsed.number()?;
            (parsed.into_string(), number)
        }
        None => (current.key.clone(), current.number),
    };
    bump_number_tx(&mut tx, number).await?;
    sqlx::query(
        "UPDATE plans SET name = ?, description = ?, status = ?, closed_at = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(name)
    .bind(description)
    .bind(status.as_str())
    .bind(closed_at)
    .bind(&now)
    .bind(&current.id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE plan_keys SET key = ?, number = ? WHERE plan_id = ?")
        .bind(&key)
        .bind(number)
        .bind(&current.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    require_plan(db, &current.id).await
}

pub async fn delete_plan(db: &Db, id: &str) -> Result<Plan> {
    let id = resolve_plan_id(db, id).await?;
    let current = require_plan(db, &id).await?;
    if current.deleted_at.is_some() {
        return Ok(current);
    }
    let now = crate::tasks::now_iso();
    sqlx::query("UPDATE plans SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&now)
        .bind(&id)
        .execute(db.pool())
        .await?;
    require_plan(db, &id).await
}

pub async fn restore_plan(db: &Db, id: &str) -> Result<Plan> {
    let id = resolve_plan_id(db, id).await?;
    let current = require_plan(db, &id).await?;
    if current.deleted_at.is_none() {
        return Ok(current);
    }
    let now = crate::tasks::now_iso();
    sqlx::query("UPDATE plans SET deleted_at = NULL, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&id)
        .execute(db.pool())
        .await?;
    require_plan(db, &id).await
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
        for (index, (key, is_epic, status)) in [
            ("LOG-1", 0, "open"),
            ("LOG-2", 0, "done"),
            ("LOG-3", 1, "done"),
        ]
        .into_iter()
        .enumerate()
        {
            sqlx::query(
                "INSERT INTO tasks (id, project_id, number, is_epic, key, title, status, priority, created_at, updated_at)
                 VALUES (?, 'log', ?, ?, ?, 't', ?, 'medium', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
            )
            .bind(key)
            .bind(index as i64 + 1)
            .bind(is_epic)
            .bind(key)
            .bind(status)
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
        assert_eq!(counts.closed_tasks, 1);
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

    #[tokio::test]
    async fn plan_keys_are_accepted_everywhere() {
        use crate::{
            DocumentKind, add_plan_item, create_document, documents_for_plan,
            link_document_to_plan, list_plan_items, remove_plan_item, unlink_document_from_plan,
        };

        let db = open().await;
        let plan = create_plan(&db, "Roadmap", "", PlanStatus::Active)
            .await
            .expect("create");
        assert_eq!((plan.key.as_str(), plan.number), ("PL-1", 1));
        assert_eq!(require_plan(&db, "PL-1").await.expect("key").id, plan.id);
        assert_eq!(
            require_plan(&db, " pl-1 ").await.expect("trimmed").id,
            plan.id
        );
        assert_eq!(require_plan(&db, &plan.id).await.expect("uuid").id, plan.id);
        assert_eq!(
            require_plan(&db, "1")
                .await
                .expect_err("bare number")
                .kind(),
            crate::AppErrorKind::Validation
        );
        assert_eq!(
            require_plan(&db, "LOG-1")
                .await
                .expect_err("other prefix")
                .kind(),
            crate::AppErrorKind::Validation
        );
        assert_eq!(
            require_plan(&db, "PL-99")
                .await
                .expect_err("unknown key")
                .kind(),
            crate::AppErrorKind::NotFound
        );

        sqlx::query(
            "INSERT INTO tasks (id, project_id, number, key, title, status, priority, created_at, updated_at)
             VALUES ('t1', 'log', 1, 'LOG-1', 'Task', 'backlog', 'medium', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(db.pool())
        .await
        .expect("task");
        add_plan_item(&db, "PL-1", "LOG-1")
            .await
            .expect("add item by key");
        assert_eq!(list_plan_items(&db, "pl-1").await.expect("items").len(), 1);
        assert_eq!(plan_counts(&db, "PL-1").await.expect("counts").tasks, 1);
        remove_plan_item(&db, "PL-1", "LOG-1")
            .await
            .expect("remove item by key");
        assert!(
            list_plan_items(&db, &plan.id)
                .await
                .expect("items")
                .is_empty()
        );

        let document = create_document(&db, "log", DocumentKind::Adr, "ADR", "", None)
            .await
            .expect("document");
        link_document_to_plan(&db, "PL-1", "LOG-DOC-1")
            .await
            .expect("link by plan key");
        assert_eq!(
            documents_for_plan(&db, "pl-1").await.expect("linked").len(),
            1
        );
        unlink_document_from_plan(&db, "PL-1", "LOG-DOC-1")
            .await
            .expect("unlink by plan key");
        assert!(
            documents_for_plan(&db, &plan.id)
                .await
                .expect("linked")
                .is_empty()
        );
        let _ = document;

        let renamed = update_plan(
            &db,
            "PL-1",
            &PlanPatch {
                key: Some("pl-7".into()),
                ..PlanPatch::default()
            },
            None,
        )
        .await
        .expect("rename key");
        assert_eq!(renamed.key, "PL-7");
        assert_eq!(
            require_plan(&db, "PL-7").await.expect("new key").id,
            plan.id
        );
        assert_eq!(
            require_plan(&db, "PL-1").await.expect_err("old key").kind(),
            crate::AppErrorKind::NotFound
        );

        let other = create_plan(&db, "Other", "", PlanStatus::Backlog)
            .await
            .expect("other");
        assert_eq!(other.key, "PL-8");
        assert_eq!(
            update_plan(
                &db,
                &other.id,
                &PlanPatch {
                    key: Some("PL-7".into()),
                    ..PlanPatch::default()
                },
                None,
            )
            .await
            .expect_err("duplicate key")
            .kind(),
            crate::AppErrorKind::Conflict
        );

        delete_plan(&db, "PL-7").await.expect("delete by key");
        restore_plan(&db, "pl-7").await.expect("restore by key");
        delete_plan(&db, "PL-7").await.expect("delete again");
        let next = create_plan(&db, "Next", "", PlanStatus::Backlog)
            .await
            .expect("next");
        assert_eq!(next.key, "PL-9");
    }
}
