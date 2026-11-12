#![deny(unsafe_code)]

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn links_the_bundled_sqlite() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        let version: String = sqlx::query_scalar("select sqlite_version()")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(version.starts_with("3."));
    }
}
