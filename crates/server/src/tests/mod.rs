use std::path::PathBuf;

use axum::body::{Body, to_bytes};
use axum::http::{HeaderMap, Method, Request, StatusCode};
use serde_json::Value;
use tower::ServiceExt;
use xboct_log_core::BackupConfig;

use super::*;

struct TestApp {
    dir: PathBuf,
    state: AppState,
    router: Router,
}

async fn test_app() -> TestApp {
    test_app_with_events(Events::new()).await
}

async fn test_app_with_events(events: Events) -> TestApp {
    let dir = xboct_log_test_support::scratch_dir("server");

    let db = Db::open(":memory:").await.unwrap();
    sqlx::query("CREATE TABLE tasks (id TEXT PRIMARY KEY, key TEXT NOT NULL)")
        .execute(db.pool())
        .await
        .unwrap();
    sqlx::query(
        "CREATE TABLE tags (
            name TEXT PRIMARY KEY,
            archived INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query(
        "CREATE TABLE task_attachments (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            stored_name TEXT NOT NULL,
            deleted_at TEXT
        )",
    )
    .execute(db.pool())
    .await
    .unwrap();
    sqlx::query("INSERT INTO tasks (id, key) VALUES ('t1', 'SPA-1')")
        .execute(db.pool())
        .await
        .unwrap();

    let config = Config {
        db_path: dir.join("data/xboct-log.db"),
        media_dir: dir.join("media"),
        backup_dir: dir.join("backups"),
        web_dir: dir.join("web"),
        backup: BackupConfig {
            hour: 3,
            minute: 0,
            weekday: 0,
            daily_keep: 7,
            weekly_keep: 4,
            auto_keep: 48,
            auto_interval_min: 30,
            disabled: false,
        },
        activity_keep_days: 365,
        request_log_keep_days: 30,
    };
    let state = AppState {
        db: Arc::new(db),
        config: Arc::new(config),
        events: Arc::new(events),
        tags_hint: String::new(),
    };
    let router = app(state.clone());

    TestApp { dir, state, router }
}

impl TestApp {
    async fn stop(self) {
        drop(self.router);
        if let Ok(db) = Arc::try_unwrap(self.state.db) {
            db.close().await;
        }
        let _ = std::fs::remove_dir_all(self.dir);
    }

    async fn add_attachment(
        &self,
        id: &str,
        file_name: &str,
        stored_name: &str,
        deleted: bool,
        data: Option<&[u8]>,
    ) {
        sqlx::query(
            "INSERT INTO task_attachments (id, task_id, file_name, stored_name, deleted_at)
             VALUES (?, 't1', ?, ?, ?)",
        )
        .bind(id)
        .bind(file_name)
        .bind(stored_name)
        .bind(if deleted {
            Some("2026-01-01T00:00:00.000Z")
        } else {
            None
        })
        .execute(self.state.db.pool())
        .await
        .unwrap();

        if let Some(data) = data {
            let path = xboct_log_core::media::stored_path(
                &self.state.config.resolved_media_dir(),
                id,
                stored_name,
            );
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, data).unwrap();
        }
    }

    async fn get(&self, uri: &str) -> (StatusCode, HeaderMap, Vec<u8>) {
        self.request(Method::GET, uri).await
    }

    async fn post(&self, uri: &str) -> (StatusCode, HeaderMap, Vec<u8>) {
        self.request(Method::POST, uri).await
    }

    async fn post_json(
        &self,
        uri: &str,
        body: &str,
        client: Option<&str>,
    ) -> (StatusCode, HeaderMap, Vec<u8>) {
        let mut builder = Request::builder()
            .method(Method::POST)
            .uri(uri)
            .header(header::CONTENT_TYPE, "application/json");
        if let Some(client) = client {
            builder = builder.header(CLIENT_HEADER, client);
        }
        let request = builder.body(Body::from(body.to_owned())).unwrap();
        let response = self.router.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, headers, body.to_vec())
    }

    async fn request(&self, method: Method, uri: &str) -> (StatusCode, HeaderMap, Vec<u8>) {
        let request = Request::builder()
            .method(method)
            .uri(uri)
            .body(Body::empty())
            .unwrap();
        let response = self.router.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, headers, body.to_vec())
    }
}

fn header(headers: &HeaderMap, name: &str) -> String {
    headers
        .get(name)
        .unwrap_or_else(|| panic!("missing header {name}"))
        .to_str()
        .unwrap()
        .to_owned()
}

#[tokio::test]
async fn serves_the_openapi_document_of_the_registry() {
    let app = test_app().await;
    let (status, headers, body) = app.get("/api/openapi.json").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(header(&headers, "content-type"), "application/json");
    let value: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["openapi"], "3.1.0");
    let paths = value["paths"].as_object().unwrap();
    assert_eq!(paths.len(), metadata().len());
    assert!(paths.contains_key("/api/tasks_list"));
    assert!(paths.contains_key("/api/backups_restore"));
}

mod api;
mod media;
mod sse;
