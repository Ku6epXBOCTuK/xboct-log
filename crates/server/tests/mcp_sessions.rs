use std::path::Path;
use std::sync::Arc;

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode, header};
use serde_json::{Value, json};
use tower::ServiceExt;
use xboct_log_core::{Config, Db, Events};
use xboct_log_server::{AppState, app};

const LEGACY_VERSION: &str = "2025-06-18";

#[tokio::test]
async fn an_old_session_id_works_after_a_restart() {
    let dir = xboct_log_test_support::scratch_dir("mcp-sessions");
    let first = router(&dir).await;
    let (status, session) = rpc(
        &first,
        "initialize",
        json!({
            "protocolVersion": LEGACY_VERSION,
            "capabilities": {},
            "clientInfo": { "name": "sessions-test", "version": "0.0.0" },
        }),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let session = session.expect("initialize answers with a session id");

    drop(first);
    let second = router(&dir).await;
    let (status, _) = rpc(&second, "tools/list", json!({}), Some(&session)).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_deleted_session_stays_gone_after_a_restart() {
    let dir = xboct_log_test_support::scratch_dir("mcp-sessions");
    let first = router(&dir).await;
    let (_, session) = rpc(
        &first,
        "initialize",
        json!({
            "protocolVersion": LEGACY_VERSION,
            "capabilities": {},
            "clientInfo": { "name": "sessions-test", "version": "0.0.0" },
        }),
        None,
    )
    .await;
    let session = session.expect("initialize answers with a session id");
    let response = first
        .clone()
        .oneshot(
            Request::delete("/mcp")
                .header(header::HOST, "localhost")
                .header("mcp-session-id", &session)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::ACCEPTED);

    drop(first);
    let second = router(&dir).await;
    let (status, _) = rpc(&second, "tools/list", json!({}), Some(&session)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

async fn router(dir: &Path) -> Router {
    let database = dir.join("xboct-log.db");
    let config = Arc::new(
        Config::from_lookup(|name| match name {
            "XBOCT_LOG_DB" => Some(database.display().to_string()),
            "XBOCT_LOG_BACKUP_DISABLED" => Some("1".to_owned()),
            _ => None,
        })
        .unwrap(),
    );
    let db = Arc::new(Db::open(&config.db_path).await.unwrap());
    app(AppState {
        db,
        config,
        events: Arc::new(Events::new()),
        tags_hint: String::new(),
    })
}

async fn rpc(
    router: &Router,
    method: &str,
    params: Value,
    session: Option<&str>,
) -> (StatusCode, Option<String>) {
    let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
    let mut request = Request::post("/mcp")
        .header(header::HOST, "localhost")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::ACCEPT, "application/json, text/event-stream");
    if let Some(session) = session {
        request = request.header("mcp-session-id", session);
    }
    let response = router
        .clone()
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let session = response
        .headers()
        .get("mcp-session-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let _ = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, session)
}
