use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;

use crate::Result;

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, JsonSchema,
)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    Backlog,
    Open,
    InProgress,
    Blocked,
    Done,
    Cancelled,
}

impl Status {
    pub const ALL: [Self; 6] = [
        Self::Backlog,
        Self::Open,
        Self::InProgress,
        Self::Blocked,
        Self::Done,
        Self::Cancelled,
    ];

    pub const ACTIVE: [Self; 3] = [Self::Open, Self::InProgress, Self::Blocked];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Backlog => "backlog",
            Self::Open => "open",
            Self::InProgress => "in-progress",
            Self::Blocked => "blocked",
            Self::Done => "done",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn rank(self) -> i64 {
        match self {
            Self::Backlog => 0,
            Self::Open => 1,
            Self::InProgress => 2,
            Self::Blocked => 3,
            Self::Done => 4,
            Self::Cancelled => 5,
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|status| status.as_str() == value)
    }
}

pub async fn count_by_status(
    pool: &SqlitePool,
    project_id: Option<&str>,
    is_epic: bool,
) -> Result<BTreeMap<Status, i64>> {
    let mut sql =
        String::from("SELECT status, COUNT(*) FROM tasks WHERE deleted_at IS NULL AND is_epic = ?");
    if project_id.is_some() {
        sql.push_str(" AND project_id = ?");
    }
    sql.push_str(" GROUP BY status");

    let mut query = sqlx::query_as(sqlx::AssertSqlSafe(sql)).bind(i64::from(is_epic));
    if let Some(project_id) = project_id {
        query = query.bind(project_id);
    }
    let rows: Vec<(String, i64)> = query.fetch_all(pool).await?;

    let mut counts: BTreeMap<Status, i64> = Status::ALL.iter().map(|status| (*status, 0)).collect();
    for (status, count) in rows {
        if let Ok(status) = serde_json::from_value::<Status>(Value::String(status)) {
            counts.insert(status, count);
        }
    }
    Ok(counts)
}

pub async fn count_tasks_by_status(pool: &SqlitePool) -> Result<BTreeMap<Status, i64>> {
    count_by_status(pool, None, false).await
}
