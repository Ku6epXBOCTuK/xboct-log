use sqlx::migrate::Migrator;

use crate::{
    db::Db,
    error::{AppError, Result},
};

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

const NODE_MIGRATIONS: [&str; 26] = [
    "001_init.js",
    "002_scopes.js",
    "003_soft_delete.js",
    "004_task_blocked_by.js",
    "005_activity_log.js",
    "006_projects_prefix_case.js",
    "007_task_comments.js",
    "008_task_revisions.js",
    "009_activity_changes.js",
    "010_task_source_unique.js",
    "011_drop_task_source_line.js",
    "012_blocked_from_status.js",
    "013_task_estimate.js",
    "014_task_assignee_due_at.js",
    "015_task_attachments.js",
    "016_task_links.js",
    "017_task_blocked_reason.js",
    "018_project_repo.js",
    "019_activity_client.js",
    "020_tags.js",
    "021_task_tags.js",
    "022_attachment_soft_delete.js",
    "023_task_identity.js",
    "024_task_activity_identity.js",
    "025_drop_activity_old_id.js",
    "026_task_auto_closed.js",
];

const CREATE_SQLX_MIGRATIONS: &str = "CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
)";

pub(crate) async fn migrate(db: &Db) -> Result<()> {
    let node_history = table_exists(db, "schema_migrations").await?;
    let rust_history = table_exists(db, "_sqlx_migrations").await?;

    if node_history && !rust_history {
        mark_existing_migrations_as_applied(db).await?;
    }

    MIGRATOR
        .run(db.pool())
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;

    Ok(())
}

async fn table_exists(db: &Db, name: &str) -> Result<bool> {
    let count: i64 =
        sqlx::query_scalar("select count(*) from sqlite_master where type = 'table' and name = ?")
            .bind(name)
            .fetch_one(db.pool())
            .await?;
    Ok(count > 0)
}

async fn mark_existing_migrations_as_applied(db: &Db) -> Result<()> {
    let mut connection = db.pool().acquire().await?;

    let applied: Vec<String> =
        sqlx::query_scalar("select name from schema_migrations order by name")
            .fetch_all(&mut *connection)
            .await?;
    if !applied
        .iter()
        .map(String::as_str)
        .eq(NODE_MIGRATIONS.iter().copied())
    {
        return Err(AppError::unexpected(format!(
            "schema_migrations does not match the node history: {} rows",
            applied.len()
        )));
    }

    let migration = MIGRATOR
        .iter()
        .next()
        .ok_or_else(|| AppError::unexpected("the embedded migration set is empty"))?;

    sqlx::query(CREATE_SQLX_MIGRATIONS)
        .execute(&mut *connection)
        .await?;
    sqlx::query(
        "insert into _sqlx_migrations (version, description, installed_on, success, checksum, execution_time)
         values (?, ?, CURRENT_TIMESTAMP, TRUE, ?, 0)",
    )
    .bind(migration.version)
    .bind(migration.description.as_ref())
    .bind(migration.checksum.as_ref())
    .execute(&mut *connection)
    .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use sqlx::SqliteConnection;

    use super::*;

    async fn applied_versions(connection: &mut SqliteConnection) -> Result<Vec<i64>> {
        let versions = sqlx::query_scalar("select version from _sqlx_migrations order by version")
            .fetch_all(connection)
            .await?;
        Ok(versions)
    }

    async fn fresh_db() -> Db {
        let db = Db::open(":memory:").await.unwrap();
        db.migrate().await.unwrap();
        db
    }

    #[tokio::test]
    async fn applies_the_collapsed_migration() {
        let db = fresh_db().await;

        let node_rows: i64 = sqlx::query_scalar("select count(*) from schema_migrations")
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(node_rows, 26);

        let rust_rows: Vec<i64> = sqlx::query_scalar("select version from _sqlx_migrations")
            .fetch_all(db.pool())
            .await
            .unwrap();
        assert_eq!(rust_rows, vec![1]);

        let columns: Vec<String> =
            sqlx::query_scalar("select name from pragma_table_info('tasks')")
                .fetch_all(db.pool())
                .await
                .unwrap();
        for column in ["key", "auto_closed", "scope_id", "deleted_at", "estimate"] {
            assert!(
                columns.iter().any(|name| name == column),
                "tasks is missing {column}"
            );
        }
    }

    #[tokio::test]
    async fn runs_twice_without_changes() {
        let db = fresh_db().await;
        db.migrate().await.unwrap();

        let versions = applied_versions(&mut db.pool().acquire().await.unwrap())
            .await
            .unwrap();
        assert_eq!(versions, vec![1]);
    }

    #[tokio::test]
    async fn marks_a_node_database_as_applied() {
        let db = fresh_db().await;
        sqlx::query("drop table _sqlx_migrations")
            .execute(db.pool())
            .await
            .unwrap();

        db.migrate().await.unwrap();

        let versions = applied_versions(&mut db.pool().acquire().await.unwrap())
            .await
            .unwrap();
        assert_eq!(versions, vec![1]);
    }

    #[tokio::test]
    async fn refuses_an_incomplete_node_history() {
        let db = fresh_db().await;
        sqlx::query("delete from schema_migrations where name = '026_task_auto_closed.js'")
            .execute(db.pool())
            .await
            .unwrap();
        sqlx::query("drop table _sqlx_migrations")
            .execute(db.pool())
            .await
            .unwrap();

        assert!(db.migrate().await.is_err());
    }
}
