use schemars::JsonSchema;
use serde::Serialize;
use sqlx::SqlitePool;

use crate::{AppError, PlanId, PlanKey, Result};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct PlanRef {
    pub id: String,
    pub name: String,
}

pub async fn resolve_plan_id(pool: &SqlitePool, id: &str) -> Result<String> {
    let raw = id.trim();
    if let Ok(id) = PlanId::parse(raw) {
        return Ok(id.into_string());
    }
    let key = match PlanKey::parse(raw) {
        Ok(key) => key,
        Err(error) => {
            let existing: Option<String> = sqlx::query_scalar("SELECT id FROM plans WHERE id = ?")
                .bind(raw)
                .fetch_optional(pool)
                .await?;
            return existing.ok_or(error);
        }
    };
    let id = sqlx::query_scalar(
        "SELECT p.id FROM plans p JOIN plan_keys pk ON pk.plan_id = p.id WHERE pk.key = ?",
    )
    .bind(key.as_str())
    .fetch_optional(pool)
    .await?;
    id.ok_or_else(|| AppError::not_found(format!("plan {key} not found")))
}
