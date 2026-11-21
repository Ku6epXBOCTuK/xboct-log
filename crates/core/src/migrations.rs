use sqlx::migrate::Migrator;

use crate::{
    db::Db,
    error::{AppError, Result},
};

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

const NODE_MIGRATIONS: &[&str] = &[
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

pub fn known_migrations() -> &'static [&'static str] {
    NODE_MIGRATIONS
}

const CREATE_SQLX_MIGRATIONS: &str = "CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL
)";

pub(crate) async fn migrate(db: &Db) -> Result<()> {
    let node_history = db.table_exists("schema_migrations").await?;
    if node_history {
        align_rust_history(db).await?;
    }

    MIGRATOR
        .run(db.pool())
        .await
        .map_err(|error| AppError::unexpected(error.to_string()))?;

    Ok(())
}

async fn align_rust_history(db: &Db) -> Result<()> {
    let applied: Vec<String> =
        sqlx::query_scalar("select name from schema_migrations order by name")
            .fetch_all(db.pool())
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

    if db.table_exists("_sqlx_migrations").await? {
        let checksum: Option<Vec<u8>> =
            sqlx::query_scalar("select checksum from _sqlx_migrations where version = ?")
                .bind(migration.version)
                .fetch_optional(db.pool())
                .await?;
        if checksum.as_deref() == Some(migration.checksum.as_ref()) {
            return Ok(());
        }
        sqlx::query("drop table _sqlx_migrations")
            .execute(db.pool())
            .await?;
    }

    sqlx::query(CREATE_SQLX_MIGRATIONS)
        .execute(db.pool())
        .await?;
    sqlx::query(
        "insert into _sqlx_migrations (version, description, installed_on, success, checksum, execution_time)
         values (?, ?, CURRENT_TIMESTAMP, TRUE, ?, 0)",
    )
    .bind(migration.version)
    .bind(migration.description.as_ref())
    .bind(migration.checksum.as_ref())
    .execute(db.pool())
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

    fn embedded_versions() -> Vec<i64> {
        MIGRATOR
            .migrations
            .iter()
            .map(|migration| migration.version)
            .collect()
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
        assert_eq!(node_rows, NODE_MIGRATIONS.len() as i64);

        let rust_rows = applied_versions(&mut db.pool().acquire().await.unwrap())
            .await
            .unwrap();
        assert_eq!(rust_rows, embedded_versions());

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
    async fn creates_plan_tables_without_project_scope() {
        let db = fresh_db().await;

        let tables: Vec<String> = sqlx::query_scalar(
            "select name from sqlite_master where type = 'table' and name in
             ('plans', 'plan_items', 'plan_notes', 'documents', 'plan_documents', 'text_revisions')
             order by name",
        )
        .fetch_all(db.pool())
        .await
        .unwrap();
        assert_eq!(
            tables,
            vec![
                "documents",
                "plan_documents",
                "plan_items",
                "plan_notes",
                "plans",
                "text_revisions"
            ]
        );

        for table in ["plans", "plan_items", "plan_notes", "plan_documents"] {
            let columns: Vec<String> = sqlx::query_scalar("select name from pragma_table_info(?)")
                .bind(table)
                .fetch_all(db.pool())
                .await
                .unwrap();
            assert!(
                !columns.iter().any(|name| name == "project_id"),
                "{table} is project-scoped"
            );
        }

        let item_columns: Vec<String> =
            sqlx::query_scalar("select name from pragma_table_info('plan_items')")
                .fetch_all(db.pool())
                .await
                .unwrap();
        assert!(item_columns.iter().any(|name| name == "task_id"));
    }

    #[tokio::test]
    async fn accepts_items_from_different_projects_in_one_plan() {
        let db = fresh_db().await;

        for (id, prefix) in [("one", "ONE"), ("two", "TWO")] {
            sqlx::query(
                "insert into projects (id, prefix, name, created_at) values (?, ?, ?, '2026-01-01T00:00:00.000Z')",
            )
            .bind(id)
            .bind(prefix)
            .bind(id)
            .execute(db.pool())
            .await
            .unwrap();
        }

        for (id, project) in [("t1", "one"), ("t2", "two")] {
            sqlx::query(
                "insert into tasks (id, project_id, number, key, title, status, priority, created_at, updated_at)
                 values (?, ?, 1, ?, 'task', 'backlog', 'medium', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
            )
            .bind(id)
            .bind(project)
            .bind(id)
            .execute(db.pool())
            .await
            .unwrap();
        }

        sqlx::query(
            "insert into plans (id, name, status, created_at, updated_at)
             values ('p1', 'Plan', 'backlog', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
        )
        .execute(db.pool())
        .await
        .unwrap();

        for (task, position) in [("t1", 1024), ("t2", 2048)] {
            sqlx::query("insert into plan_items (plan_id, task_id, position) values ('p1', ?, ?)")
                .bind(task)
                .bind(position)
                .execute(db.pool())
                .await
                .unwrap();
        }

        let count: i64 = sqlx::query_scalar("select count(*) from plan_items where plan_id = 'p1'")
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn runs_twice_without_changes() {
        let db = fresh_db().await;
        db.migrate().await.unwrap();

        let versions = applied_versions(&mut db.pool().acquire().await.unwrap())
            .await
            .unwrap();
        assert_eq!(versions, embedded_versions());
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
        assert_eq!(versions, embedded_versions());
    }

    #[tokio::test]
    async fn repairs_a_changed_rust_checksum() {
        let db = fresh_db().await;
        sqlx::query("update _sqlx_migrations set checksum = x'00'")
            .execute(db.pool())
            .await
            .unwrap();

        db.migrate().await.unwrap();

        let versions = applied_versions(&mut db.pool().acquire().await.unwrap())
            .await
            .unwrap();
        assert_eq!(versions, embedded_versions());
    }

    #[tokio::test]
    async fn backfills_keys_for_plans_created_before_migration_four() {
        let db = fresh_db().await;
        for statement in [
            "DROP TABLE plan_keys",
            "DROP TABLE plan_number_high_water",
            "DELETE FROM _sqlx_migrations WHERE version = 4",
        ] {
            sqlx::query(statement).execute(db.pool()).await.unwrap();
        }
        for (id, created) in [
            ("p2", "2026-01-02T00:00:00.000Z"),
            ("p1", "2026-01-01T00:00:00.000Z"),
        ] {
            sqlx::query(
                "INSERT INTO plans (id, name, status, created_at, updated_at)
                 VALUES (?, 'Plan', 'backlog', ?, ?)",
            )
            .bind(id)
            .bind(created)
            .bind(created)
            .execute(db.pool())
            .await
            .unwrap();
        }

        db.migrate().await.unwrap();
        let keys: Vec<(String, String, i64)> =
            sqlx::query_as("SELECT plan_id, key, number FROM plan_keys ORDER BY number")
                .fetch_all(db.pool())
                .await
                .unwrap();
        assert_eq!(
            keys,
            vec![
                ("p1".into(), "PL-1".into(), 1),
                ("p2".into(), "PL-2".into(), 2)
            ]
        );
        let high: i64 = sqlx::query_scalar("SELECT last_number FROM plan_number_high_water")
            .fetch_one(db.pool())
            .await
            .unwrap();
        assert_eq!(high, 2);

        sqlx::query("DELETE FROM _sqlx_migrations WHERE version = 4")
            .execute(db.pool())
            .await
            .unwrap();
        db.migrate().await.unwrap();
        let keys: Vec<(String, String, i64)> =
            sqlx::query_as("SELECT plan_id, key, number FROM plan_keys ORDER BY number")
                .fetch_all(db.pool())
                .await
                .unwrap();
        assert_eq!(keys.len(), 2);
    }

    #[tokio::test]
    async fn rekeys_documents_created_before_migration_five() {
        let db = fresh_db().await;
        sqlx::query("DELETE FROM _sqlx_migrations WHERE version = 5")
            .execute(db.pool())
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO projects (id, prefix, name, created_at)
             VALUES ('log', 'LOG', 'Log', '2026-01-01T00:00:00.000Z')",
        )
        .execute(db.pool())
        .await
        .unwrap();
        for (id, number, key) in [("d1", 1, "LOG-1"), ("d2", 2, "log-doc-2")] {
            sqlx::query(
                "INSERT INTO documents (id, project_id, number, key, kind, title, created_at, updated_at)
                 VALUES (?, 'log', ?, ?, 'adr', 'ADR', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
            )
            .bind(id)
            .bind(number)
            .bind(key)
            .execute(db.pool())
            .await
            .unwrap();
        }
        sqlx::query(
            "INSERT INTO document_number_high_water (project_id, last_number) VALUES ('log', 2)",
        )
        .execute(db.pool())
        .await
        .unwrap();

        db.migrate().await.unwrap();

        let keys: Vec<String> = sqlx::query_scalar("SELECT key FROM documents ORDER BY number")
            .fetch_all(db.pool())
            .await
            .unwrap();
        assert_eq!(keys, vec!["LOG-DOC-1", "log-doc-2"]);
        let high: i64 = sqlx::query_scalar(
            "SELECT last_number FROM document_number_high_water WHERE project_id = 'log'",
        )
        .fetch_one(db.pool())
        .await
        .unwrap();
        assert_eq!(high, 2);
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
