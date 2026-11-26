use sqlx::{Executor, Sqlite};

use crate::error::Result;

pub(crate) async fn table_exists<'e>(
    executor: impl Executor<'e, Database = Sqlite>,
    name: &str,
) -> Result<bool> {
    let exists: Option<String> =
        sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
            .bind(name)
            .fetch_optional(executor)
            .await?;
    Ok(exists.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Db;

    #[tokio::test]
    async fn checks_table_presence() {
        let db = Db::open(":memory:").await.unwrap();
        assert!(!table_exists(db.pool(), "tasks").await.unwrap());

        sqlx::query("CREATE TABLE tasks (id INTEGER PRIMARY KEY)")
            .execute(db.pool())
            .await
            .unwrap();

        assert!(table_exists(db.pool(), "tasks").await.unwrap());
    }
}
