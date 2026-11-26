#![forbid(unsafe_code)]

use std::sync::Arc;
use std::time::Duration;

use axum::{
    Extension, Json, Router,
    body::{Body, Bytes, to_bytes},
    extract::{Path, State},
    http::{HeaderMap, HeaderName, HeaderValue, Method, Request, StatusCode, header},
    response::{
        IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::{any, get, post},
};
use chrono::Local;
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService,
    session::{SessionStore, local::LocalSessionManager},
};
use tokio::sync::broadcast::error::RecvError;
use tower::ServiceExt;
use xboct_log_core::{
    AppError, BackupKind, Config, Db, Events, attachment_format, data_fingerprint,
    media::AttachmentKind as Kind, read_attachment_file, read_deleted_attachment_file, run_backup,
};
use xboct_log_ops::{Ctx, dispatch, metadata};

pub mod mcp;
mod mcp_sessions;
mod mcp_text;
pub use mcp_text::active_tags_hint;
pub mod openapi;
pub mod static_files;

pub const APP_NAME: &str = "xboct-log";
const HEARTBEAT: Duration = Duration::from_secs(15);
const CLIENT_HEADER: &str = "x-xboct-client";

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Db>,
    pub config: Arc<Config>,
    pub events: Arc<Events>,
    pub tags_hint: String,
}

pub fn app(state: AppState) -> Router {
    let service = mcp_service(&state);
    let web_dir = state.config.web_dir.clone();
    Router::new()
        .merge(ops_router())
        .route("/api/health", get(health))
        .route("/api/openapi.json", get(openapi_document))
        .route("/api/events", get(events))
        .route("/api/backup", post(backup))
        .route("/media/{id}", get(media))
        .route("/deleted/media/{id}", get(deleted_media))
        .route("/mcp", any(mcp_entry))
        .layer(Extension(service))
        .with_state(state)
        .fallback(move |method: Method, uri: axum::http::Uri| {
            let web_dir = web_dir.clone();
            async move { static_files::serve(&web_dir, method, uri).await }
        })
}

fn ops_router() -> Router<AppState> {
    let mut router = Router::new();
    for info in metadata() {
        let path = format!("/api/{}", info.name);
        let name = info.name;
        router = router.route(
            &path,
            post(
                move |State(state): State<AppState>, headers: HeaderMap, body: Bytes| async move {
                    op_endpoint(&state, &headers, &body, name).await
                },
            ),
        );
    }
    router
}

async fn op_endpoint(state: &AppState, headers: &HeaderMap, body: &[u8], name: &str) -> Response {
    let input = if body.is_empty() {
        serde_json::json!({})
    } else {
        match serde_json::from_slice::<serde_json::Value>(body) {
            Ok(value) => value,
            Err(error) => {
                return error_response(&AppError::validation(format!(
                    "the request body is not json: {error}"
                )));
            }
        }
    };
    let client = headers
        .get(CLIENT_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(client_label);
    let ctx =
        Ctx::new(state.db.clone(), state.events.clone(), state.config.clone()).with_client(client);
    match dispatch(&ctx, name, input).await {
        Ok(value) => ok_response(value),
        Err(error) => error_response(&error),
    }
}

fn ok_response(value: serde_json::Value) -> Response {
    Json(value).into_response()
}

fn error_response(error: &AppError) -> Response {
    let status =
        StatusCode::from_u16(error.status().as_u16()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let body = serde_json::json!({
        "kind": error.kind(),
        "message": error.message(),
    });
    (status, Json(body)).into_response()
}

fn client_label(value: &str) -> Option<String> {
    let valid = !value.is_empty()
        && value.len() <= 64
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        });
    valid.then(|| value.to_string())
}

type McpService = StreamableHttpService<mcp::Backlog, LocalSessionManager>;

fn mcp_service(state: &AppState) -> McpService {
    let backlog = mcp::Backlog::new(
        state.db.clone(),
        state.config.clone(),
        state.events.clone(),
        state.tags_hint.clone(),
    );
    let store: Arc<dyn SessionStore> = Arc::new(mcp_sessions::FileSessionStore::open(
        state.config.sessions_path(),
    ));
    let mut config = StreamableHttpServerConfig::default();
    config.session_store = Some(store);
    let mut manager = LocalSessionManager::default();
    manager.session_config.keep_alive = Some(Duration::from_secs(60 * 60));
    StreamableHttpService::new(move || Ok(backlog.clone()), Arc::new(manager), config)
}

async fn mcp_entry(Extension(service): Extension<McpService>, request: Request<Body>) -> Response {
    if request.method() == Method::GET {
        return (
            StatusCode::METHOD_NOT_ALLOWED,
            [(header::CONTENT_TYPE, "application/json")],
            METHOD_NOT_ALLOWED_BODY,
        )
            .into_response();
    }
    let response = match service.oneshot(request).await {
        Ok(response) => response.into_response(),
        Err(never) => match never {},
    };
    normalize_mcp_response(response).await
}

const METHOD_NOT_ALLOWED_BODY: &str =
    r#"{"jsonrpc":"2.0","error":{"code":-32000,"message":"Method not allowed."},"id":null}"#;

const SESSION_EXPIRED_BODY: &str =
    "Not Found: Session expired. Reconnect is automatic. Repeat the request.";
const MAX_ERROR_BODY: usize = 64 * 1024;
const SESSION_ERROR_CONTEXTS: [&str; 4] = [
    "check session",
    "restore session",
    "get session",
    "accept message",
];

async fn normalize_mcp_response(response: Response) -> Response {
    if response.status() != StatusCode::INTERNAL_SERVER_ERROR {
        return response;
    }
    let (parts, body) = response.into_parts();
    let bytes = match to_bytes(body, MAX_ERROR_BODY).await {
        Ok(bytes) => bytes,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if session_error(&bytes) {
        return (StatusCode::NOT_FOUND, SESSION_EXPIRED_BODY).into_response();
    }
    Response::from_parts(parts, Body::from(bytes))
}

fn session_error(body: &[u8]) -> bool {
    let text = String::from_utf8_lossy(body);
    let Some(text) = text.strip_prefix("Encounter an error when ") else {
        return false;
    };
    SESSION_ERROR_CONTEXTS
        .iter()
        .any(|context| text.starts_with(context))
}

#[derive(serde::Serialize)]
struct Health {
    ok: bool,
    app: &'static str,
    version: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<String>,
}

async fn openapi_document() -> Json<serde_json::Value> {
    Json(openapi::document())
}

async fn health(State(state): State<AppState>) -> Response {
    (
        [(header::CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(Health {
            ok: true,
            app: APP_NAME,
            version: env!("CARGO_PKG_VERSION"),
            data: Some(data_fingerprint(&state.config.db_path)),
        }),
    )
        .into_response()
}

async fn events(State(state): State<AppState>) -> Response {
    let events = state.events.clone();
    let mut changes = events.subscribe();
    let mut resets = events.subscribe_reset();
    let stream = async_stream::stream! {
        let seq = events.current_seq();
        yield Ok::<Event, std::convert::Infallible>(sse_event("sync", &serde_json::json!({ "seq": seq })));
        loop {
            tokio::select! {
                change = changes.recv() => match change {
                    Ok(change) => yield Ok(sse_event("change", &change)),
                    Err(RecvError::Lagged(_)) => {
                        yield Ok(sse_event("sync", &serde_json::json!({ "seq": events.current_seq() })));
                    }
                    Err(RecvError::Closed) => break,
                },
                result = resets.changed() => {
                    if result.is_err() {
                        break;
                    }
                    yield Ok(sse_event("reset", &serde_json::json!({})));
                }
            }
        }
    };

    let mut response = Sse::new(stream)
        .keep_alive(KeepAlive::new().interval(HEARTBEAT).text("ping"))
        .into_response();
    let headers = response.headers_mut();
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-cache, no-transform"),
    );
    headers.insert(header::CONNECTION, HeaderValue::from_static("keep-alive"));
    headers.insert(
        HeaderName::from_static("x-accel-buffering"),
        HeaderValue::from_static("no"),
    );
    response
}

fn sse_event<T: serde::Serialize>(name: &str, data: &T) -> Event {
    let payload = serde_json::to_string(data).unwrap_or_else(|_| "null".to_owned());
    Event::default().event(name).data(payload)
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

    #[tokio::test]
    async fn passes_the_operation_result_through_unchanged() {
        let response = ok_response(serde_json::json!([{"id": "a"}]));
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value, serde_json::json!([{"id": "a"}]));

        let response = ok_response(serde_json::json!({"items": []}));
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value, serde_json::json!({"items": []}));
    }

    #[tokio::test]
    async fn health_reports_the_app_and_the_data_folder() {
        let app = test_app().await;
        let (status, headers, body) = app.get("/api/health").await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(header(&headers, "content-type"), "application/json");
        assert_eq!(header(&headers, "cache-control"), "no-store");

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

    #[tokio::test]
    async fn streams_sync_change_and_reset_over_sse() {
        use xboct_log_core::{ActivitySource, Entity};

        let app = test_app().await;
        let request = Request::builder()
            .method(Method::GET)
            .uri("/api/events")
            .body(Body::empty())
            .unwrap();
        let response = app.router.clone().oneshot(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let headers = response.headers();
        assert_eq!(header(headers, "content-type"), "text/event-stream");
        assert_eq!(header(headers, "cache-control"), "no-cache, no-transform");
        assert_eq!(header(headers, "connection"), "keep-alive");
        assert_eq!(header(headers, "x-accel-buffering"), "no");

        let mut stream = response.into_body().into_data_stream();
        assert_eq!(
            next_frame(&mut stream).await,
            "event: sync\ndata: {\"seq\":0}\n\n"
        );

        app.state
            .events
            .publish_change(Entity::Tasks, "tasks_update", ActivitySource::Ui, None);
        assert_eq!(
            next_frame(&mut stream).await,
            "event: change\ndata: {\"seq\":1,\"entity\":\"tasks\",\"op\":\"tasks_update\",\"source\":\"ui\",\"client\":null}\n\n"
        );

        app.state.events.publish_reset();
        assert_eq!(next_frame(&mut stream).await, "event: reset\ndata: {}\n\n");

        drop(stream);
        app.stop().await;
    }

    #[tokio::test]
    async fn resyncs_a_lagged_sse_client_without_reloading_the_app() {
        use xboct_log_core::{ActivitySource, Entity};

        let app = test_app_with_events(Events::with_capacity(2)).await;
        let request = Request::builder()
            .method(Method::GET)
            .uri("/api/events")
            .body(Body::empty())
            .unwrap();
        let response = app.router.clone().oneshot(request).await.unwrap();
        let mut stream = response.into_body().into_data_stream();

        assert_eq!(
            next_frame(&mut stream).await,
            "event: sync\ndata: {\"seq\":0}\n\n"
        );

        for _ in 0..3 {
            app.state.events.publish_change(
                Entity::Tasks,
                "tasks_update",
                ActivitySource::Ui,
                None,
            );
        }

        assert_eq!(
            next_frame(&mut stream).await,
            "event: sync\ndata: {\"seq\":3}\n\n"
        );
        assert_eq!(
            next_frame(&mut stream).await,
            "event: change\ndata: {\"seq\":2,\"entity\":\"tasks\",\"op\":\"tasks_update\",\"source\":\"ui\",\"client\":null}\n\n"
        );
        assert_eq!(
            next_frame(&mut stream).await,
            "event: change\ndata: {\"seq\":3,\"entity\":\"tasks\",\"op\":\"tasks_update\",\"source\":\"ui\",\"client\":null}\n\n"
        );

        app.state.events.publish_reset();
        assert_eq!(next_frame(&mut stream).await, "event: reset\ndata: {}\n\n");

        drop(stream);
        app.stop().await;
    }

    async fn next_frame(stream: &mut axum::body::BodyDataStream) -> String {
        use futures_util::StreamExt;

        let frame = tokio::time::timeout(Duration::from_secs(5), stream.next())
            .await
            .expect("no sse frame within 5 s")
            .expect("the sse stream ended")
            .expect("the sse frame failed");
        String::from_utf8(frame.to_vec()).unwrap()
    }

    #[tokio::test]
    async fn serves_every_operation_over_rest() {
        let app = test_app().await;

        let (status, _, body) = app.post_json("/api/tags_dictionary", "", None).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, br#"{"items":[]}"#);

        let (status, _, body) = app
            .post_json("/api/tags_create", r#"{"name":"api"}"#, Some("tab-7"))
            .await;
        assert_eq!(status, StatusCode::OK);
        let created: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(created["name"], "api");
        assert_eq!(created["archived"], false);

        let (_, _, body) = app.post_json("/api/tags_dictionary", "", None).await;
        assert_eq!(body, br#"{"items":["api"]}"#);

        app.stop().await;
    }

    #[tokio::test]
    async fn reports_operation_errors_as_json() {
        let app = test_app().await;

        let (status, headers, body) = app
            .post_json(
                "/api/tags_rename",
                r#"{"name":"nope","new_name":"x"}"#,
                None,
            )
            .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(header(&headers, "content-type"), "application/json");
        let error: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(error["kind"], "not_found");
        assert_eq!(error["message"], "tag nope not found");

        let (status, _, body) = app.post_json("/api/tasks_list", "not json", None).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let error: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(error["kind"], "validation");

        app.stop().await;
    }

    #[tokio::test]
    async fn maps_a_terminated_session_error_to_not_found() {
        for body in [
            "Encounter an error when restore session: Session error: Session service terminated",
            "Encounter an error when get session: Session error: Session service terminated",
        ] {
            let response = Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from(body))
                .unwrap();
            let response = normalize_mcp_response(response).await;

            assert_eq!(response.status(), StatusCode::NOT_FOUND);
            let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert_eq!(bytes, SESSION_EXPIRED_BODY);
        }
    }

    #[tokio::test]
    async fn keeps_other_internal_errors_unchanged() {
        let response = Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from("boom"))
            .unwrap();
        let response = normalize_mcp_response(response).await;

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(header(response.headers(), "content-type"), "text/plain");
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(&bytes[..], b"boom");
    }
}
