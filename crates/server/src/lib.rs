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
mod tests;
