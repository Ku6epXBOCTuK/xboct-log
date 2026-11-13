#![forbid(unsafe_code)]

use std::sync::Arc;

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::{HeaderName, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::Local;
use xboct_log_core::{
    AppError, BackupKind, Config, Db, attachment_format, data_fingerprint,
    media::AttachmentKind as Kind, read_attachment_file, read_deleted_attachment_file, run_backup,
};

pub const APP_NAME: &str = "xboct-log";

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Db>,
    pub config: Arc<Config>,
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/backup", post(backup))
        .route("/media/{id}", get(media))
        .route("/deleted/media/{id}", get(deleted_media))
        .with_state(state)
}

#[derive(serde::Serialize)]
struct Health {
    ok: bool,
    app: &'static str,
    version: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
}

async fn health(State(state): State<AppState>) -> Json<Health> {
    Json(Health {
        ok: true,
        app: APP_NAME,
        version: env!("CARGO_PKG_VERSION"),
        data: Some(data_fingerprint(&state.config.db_path)),
    })
}

#[derive(serde::Serialize)]
struct BackupSaved {
    ok: bool,
    path: String,
}

#[derive(serde::Serialize)]
struct BackupFailed {
    ok: bool,
    error: String,
}

async fn backup(State(state): State<AppState>) -> Response {
    let saved = run_backup(
        &state.db,
        &state.config.backup_dir,
        &state.config.backup,
        BackupKind::Manual,
        Local::now(),
    )
    .await;

    match saved {
        Ok(path) => (
            StatusCode::OK,
            Json(BackupSaved {
                ok: true,
                path: path.to_string_lossy().into_owned(),
            }),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(BackupFailed {
                ok: false,
                error: error.message().to_owned(),
            }),
        )
            .into_response(),
    }
}

async fn media(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let contents = read_attachment_file(&state.db, &state.config.resolved_media_dir(), &id).await;
    media_response(contents)
}

async fn deleted_media(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let contents =
        read_deleted_attachment_file(&state.db, &state.config.resolved_media_dir(), &id).await;
    media_response(contents)
}

fn media_response(
    contents: xboct_log_core::Result<xboct_log_core::AttachmentContents>,
) -> Response {
    match contents {
        Ok(contents) => {
            let length = contents.data.len();
            let mut response = Response::new(Body::from(contents.data));
            let headers = response.headers_mut();
            for (name, value) in media_headers(&contents.file_name) {
                headers.insert(name, value);
            }
            if let Ok(value) = HeaderValue::from_str(&length.to_string()) {
                headers.insert(header::CONTENT_LENGTH, value);
            }
            headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            response
        }
        Err(error) => media_error(&error),
    }
}

fn media_error(error: &AppError) -> Response {
    let status =
        StatusCode::from_u16(error.status().as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let mut response = Response::new(Body::from(error.message().to_owned()));
    *response.status_mut() = status;
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    headers.insert(
        HeaderName::from_static("x-content-type-options"),
        HeaderValue::from_static("nosniff"),
    );
    response
}

fn media_headers(file_name: &str) -> Vec<(HeaderName, HeaderValue)> {
    let format = attachment_format(file_name);
    let mime = format.map_or("application/octet-stream", |format| format.mime);
    let inline = format.is_some_and(|format| format.kind != Kind::File);
    let sanitized: String = file_name
        .chars()
        .map(|character| match character {
            '"' | '\\' | '\r' | '\n' => '_',
            other => other,
        })
        .collect();
    let disposition = format!(
        "{}; filename=\"{sanitized}\"",
        if inline { "inline" } else { "attachment" }
    );

    let mut headers = vec![
        (
            header::CONTENT_TYPE,
            HeaderValue::from_str(mime)
                .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
        ),
        (
            header::CONTENT_DISPOSITION,
            HeaderValue::from_bytes(disposition.as_bytes())
                .unwrap_or_else(|_| HeaderValue::from_static("attachment")),
        ),
        (
            HeaderName::from_static("x-content-type-options"),
            HeaderValue::from_static("nosniff"),
        ),
    ];

    // NOTE: Chromium's PDF viewer is blocked by the sandbox directive (crbug 41131921)
    if let Some(format) = format
        && inline
        && format.kind != Kind::Pdf
    {
        headers.push((
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("default-src 'none'; sandbox"),
        ));
    }
    headers
}

#[cfg(test)]
mod tests {
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
        let dir = std::env::temp_dir().join(format!(
            "xboct-log-server-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();

        let db = Db::open(":memory:").await.unwrap();
        sqlx::query("CREATE TABLE tasks (id TEXT PRIMARY KEY, key TEXT NOT NULL)")
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
        };
        let state = AppState {
            db: Arc::new(db),
            config: Arc::new(config),
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
    async fn health_reports_the_app_and_the_data_folder() {
        let app = test_app().await;
        let (status, headers, body) = app.get("/api/health").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(header(&headers, "content-type"), "application/json");

        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["ok"], true);
        assert_eq!(value["app"], "xboct-log");
        assert_eq!(value["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(
            value["data"],
            data_fingerprint(std::path::Path::new(&app.state.config.db_path))
        );

        app.stop().await;
    }

    #[tokio::test]
    async fn serves_the_live_attachment_bytes() {
        let app = test_app().await;
        app.add_attachment("ab12", "note.md", "ab12.md", false, Some(b"# hello"))
            .await;

        let (status, headers, body) = app.get("/media/ab12").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"# hello");
        assert_eq!(header(&headers, "content-type"), "text/markdown");
        assert_eq!(
            header(&headers, "content-disposition"),
            "inline; filename=\"note.md\""
        );
        assert_eq!(header(&headers, "content-length"), "7");
        assert_eq!(header(&headers, "cache-control"), "no-store");
        assert_eq!(header(&headers, "x-content-type-options"), "nosniff");
        assert_eq!(
            header(&headers, "content-security-policy"),
            "default-src 'none'; sandbox"
        );

        app.stop().await;
    }

    #[tokio::test]
    async fn hides_a_deleted_attachment_on_the_live_route() {
        let app = test_app().await;
        app.add_attachment("cd34", "old.txt", "cd34.txt", true, Some(b"old"))
            .await;

        let (status, headers, body) = app.get("/media/cd34").await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(
            header(&headers, "content-type"),
            "text/plain; charset=utf-8"
        );
        assert_eq!(header(&headers, "x-content-type-options"), "nosniff");
        assert_eq!(body, b"no attachment with the id cd34");

        let (status, _, body) = app.get("/deleted/media/cd34").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, b"old");

        app.stop().await;
    }

    #[tokio::test]
    async fn reports_a_file_missing_from_the_media_folder() {
        let app = test_app().await;
        app.add_attachment("ef56", "gone.txt", "ef56.txt", false, None)
            .await;

        let (status, _, body) = app.get("/media/ef56").await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(
            body,
            b"the file gone.txt of the attachment ef56 is gone from the media folder"
        );

        let (status, _, body) = app.get("/media/ffff").await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body, b"no attachment with the id ffff");

        app.stop().await;
    }

    #[tokio::test]
    async fn marks_an_archive_as_an_attachment() {
        let app = test_app().await;
        app.add_attachment("aa11", "dump.zip", "aa11.zip", false, Some(b"PK"))
            .await;

        let (status, headers, _) = app.get("/media/aa11").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(header(&headers, "content-type"), "application/zip");
        assert_eq!(
            header(&headers, "content-disposition"),
            "attachment; filename=\"dump.zip\""
        );
        assert!(headers.get("content-security-policy").is_none());

        app.stop().await;
    }

    #[tokio::test]
    async fn backup_returns_the_snapshot_path_and_replaces_it() {
        let app = test_app().await;
        sqlx::query("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)")
            .execute(app.state.db.pool())
            .await
            .unwrap();
        sqlx::query("INSERT INTO notes (body) VALUES ('kept')")
            .execute(app.state.db.pool())
            .await
            .unwrap();

        let (status, headers, body) = app.post("/api/backup").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(header(&headers, "content-type"), "application/json");

        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value["ok"], true);
        let path = PathBuf::from(value["path"].as_str().unwrap());
        assert!(path.exists());

        let snapshot = Db::open(&path).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM notes")
            .fetch_one(snapshot.pool())
            .await
            .unwrap();
        assert_eq!(count, 1);
        snapshot.close().await;

        let (status, _, _) = app.post("/api/backup").await;
        assert_eq!(status, StatusCode::OK);

        app.stop().await;
    }
}
