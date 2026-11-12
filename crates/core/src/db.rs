use std::{
    ops::{Deref, DerefMut},
    path::Path,
    time::Duration,
};

use sqlx::{
    Sqlite, SqlitePool, Transaction,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};

use crate::error::Result;

pub struct Db {
    pool: SqlitePool,
}

impl Db {
    pub async fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let memory = path == Path::new(":memory:");

        if !memory
            && let Some(parent) = path
                .parent()
                .filter(|parent| !parent.as_os_str().is_empty())
        {
            std::fs::create_dir_all(parent)?;
        }

        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(5));

        let pool = SqlitePoolOptions::new()
            .max_connections(if memory { 1 } else { 5 })
            .connect_with(options)
            .await?;

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn begin(&self) -> Result<Tx> {
        let inner = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        Ok(Tx { inner })
    }

    pub async fn close(self) {
        self.pool.close().await;
    }
}

pub struct Tx {
    inner: Transaction<'static, Sqlite>,
}

impl Tx {
    pub async fn commit(self) -> Result<()> {
        self.inner.commit().await?;
        Ok(())
    }

    pub async fn rollback(self) -> Result<()> {
        self.inner.rollback().await?;
        Ok(())
    }
}

impl Deref for Tx {
    type Target = sqlx::SqliteConnection;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl DerefMut for Tx {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.inner
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn memory_db() -> Db {
        let db = Db::open(":memory:").await.unwrap();
        sqlx::query("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)")
            .execute(db.pool())
            .await
            .unwrap();
        db
    }

    async fn note_count(db: &Db) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM notes")
            .fetch_one(db.pool())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn applies_the_pragmas() {
        let dir = std::env::temp_dir().join(format!(
            "xboct-log-db-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = dir.join("nested/tasks.db");

        let db = Db::open(&path).await.unwrap();
        assert!(path.exists());

        let journal: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(db.pool())
            .await
            .unwrap();
        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(db.pool())
            .await
            .unwrap();
        let busy_timeout: i64 = sqlx::query_scalar("PRAGMA busy_timeout")
            .fetch_one(db.pool())
            .await
            .unwrap();

        assert_eq!(journal, "wal");
        assert_eq!(foreign_keys, 1);
        assert_eq!(busy_timeout, 5_000);

        db.close().await;
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn commits_a_transaction() {
        let db = memory_db().await;

        let mut tx = db.begin().await.unwrap();
        sqlx::query("INSERT INTO notes (body) VALUES ('kept')")
            .execute(&mut *tx)
            .await
            .unwrap();
        tx.commit().await.unwrap();

        assert_eq!(note_count(&db).await, 1);
    }

    #[tokio::test]
    async fn rolls_back_on_drop() {
        let db = memory_db().await;

        {
            let mut tx = db.begin().await.unwrap();
            sqlx::query("INSERT INTO notes (body) VALUES ('dropped')")
                .execute(&mut *tx)
                .await
                .unwrap();
        }

        assert_eq!(note_count(&db).await, 0);
    }

    #[tokio::test]
    async fn rolls_back_explicitly() {
        let db = memory_db().await;

        let mut tx = db.begin().await.unwrap();
        sqlx::query("INSERT INTO notes (body) VALUES ('dropped')")
            .execute(&mut *tx)
            .await
            .unwrap();
        tx.rollback().await.unwrap();

        assert_eq!(note_count(&db).await, 0);
    }

    #[tokio::test]
    async fn creates_the_database_directory() {
        let dir = std::env::temp_dir().join(format!(
            "xboct-log-db-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));

        let db = Db::open(dir.join("a/b/tasks.db")).await.unwrap();
        db.close().await;

        assert!(dir.join("a/b/tasks.db").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
