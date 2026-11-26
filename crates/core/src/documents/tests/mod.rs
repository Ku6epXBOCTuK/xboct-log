use super::*;

async fn open() -> Db {
    let db = Db::open(":memory:").await.expect("open");
    db.migrate().await.expect("migrate");
    for (id, prefix, name) in [("log", "LOG", "Log"), ("spa", "SPA", "Space")] {
        sqlx::query(
            "INSERT INTO projects (id, prefix, name, created_at) VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z')",
        )
        .bind(id)
        .bind(prefix)
        .bind(name)
        .execute(db.pool())
        .await
        .expect("project");
    }
    db
}

#[test]
fn kinds_and_statuses_round_trip() {
    for kind in DocumentKind::ALL {
        assert_eq!(DocumentKind::from_db(kind.as_str()), Some(kind));
    }
    for status in DocumentStatus::ALL {
        assert_eq!(DocumentStatus::from_db(status.as_str()), Some(status));
    }
    assert_eq!(DocumentKind::from_db("open"), None);
    assert_eq!(DocumentStatus::from_db("open"), None);
}

mod crud;
mod list;
mod search;
