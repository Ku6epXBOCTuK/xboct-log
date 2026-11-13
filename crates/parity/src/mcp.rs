use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode, header};
use serde_json::{Value, json};
use tower::ServiceExt;
use xboct_log_core::{Config, Db, Events};
use xboct_log_server::{AppState, app};

use crate::diff::difference;
use crate::normalize::Normalizer;

const PROTOCOL_VERSION: &str = "2026-07-28";
const ATTACHMENT_URI_PREFIX: &str = "xboct-log://attachment/";

pub struct Captured {
    pub initialize: Value,
    pub tools: Value,
    pub resources: Value,
    pub templates: Value,
    pub get_status: u16,
    pub get_body: String,
}

pub async fn capture(database: &Path, runtime: &Path, now_ms: i64) -> Result<Captured, String> {
    let router = router(database, runtime).await?;
    let (initialize, session) = rpc(
        &router,
        "initialize",
        json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": { "name": "parity", "version": "0.0.0" },
        }),
        None,
    )
    .await?;
    let (tools, _) = rpc(&router, "tools/list", json!({}), session.as_deref()).await?;
    let (resources, _) = rpc(&router, "resources/list", json!({}), session.as_deref()).await?;
    let (templates, _) = rpc(
        &router,
        "resources/templates/list",
        json!({}),
        session.as_deref(),
    )
    .await?;
    let get = router
        .clone()
        .oneshot(
            Request::get("/mcp")
                .header(header::HOST, "localhost")
                .header(header::ACCEPT, "application/json, text/event-stream")
                .body(Body::empty())
                .map_err(|error| error.to_string())?,
        )
        .await
        .map_err(|error| error.to_string())?;
    let get_status = get.status().as_u16();
    let get_body = String::from_utf8_lossy(
        &to_bytes(get.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?,
    )
    .into_owned();
    let resources = normalize_resources(&resources, runtime, now_ms);
    Ok(Captured {
        initialize,
        tools,
        resources,
        templates,
        get_status,
        get_body,
    })
}

pub struct CapturedError {
    pub name: String,
    pub is_error: bool,
    pub text: String,
    pub structured_content: Option<Value>,
}

/// The failure cases node captured after its call sweep; the ids are the
/// literal values from `tests/parity/ops.node.spec.ts`.
const ERROR_CASES: [(&str, &str); 8] = [
    ("tasks_get", r#"{"task_id":"SPA-999"}"#),
    (
        "tasks_create",
        r#"{"project_id":"ghost","title":"Nowhere"}"#,
    ),
    (
        "projects_create",
        r#"{"project_id":"spa","name":"SPA again","prefix":"SPA"}"#,
    ),
    ("tasks_list", r#"{"titel":"x"}"#),
    (
        "tasks_comments_edit",
        r#"{"comment_id":"00000000-0000-0000-0000-000000000002","body":"Nowhere"}"#,
    ),
    ("scopes_delete", r#"{"scope_id":999999}"#),
    (
        "attachments_purge",
        r#"{"attachment_id":"11111111-1111-4111-8111-111111111111"}"#,
    ),
    (
        "tasks_add_link",
        r#"{"task_id":"SWP-1","link_type":"relates_to","target":"SWP-1"}"#,
    ),
];

pub async fn capture_errors(database: &Path, runtime: &Path) -> Result<Vec<CapturedError>, String> {
    let router = router(database, runtime).await?;
    let (_, session) = rpc(
        &router,
        "initialize",
        json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": { "name": "parity", "version": "0.0.0" },
        }),
        None,
    )
    .await?;
    let mut captured = Vec::new();
    for (name, arguments) in ERROR_CASES {
        let arguments: Value =
            serde_json::from_str(arguments).map_err(|error| error.to_string())?;
        let (result, _) = rpc(
            &router,
            "tools/call",
            json!({ "name": name, "arguments": arguments }),
            session.as_deref(),
        )
        .await?;
        captured.push(CapturedError {
            name: name.to_owned(),
            is_error: result["isError"].as_bool().unwrap_or(false),
            text: result["content"][0]["text"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
            structured_content: result
                .get("structuredContent")
                .cloned()
                .filter(|value| !value.is_null()),
        });
    }
    Ok(captured)
}

pub fn compare_errors(captured: &[CapturedError], fixture: &Value) -> Vec<String> {
    let mut lines = Vec::new();
    let expected = fixture["errors"].as_array().cloned().unwrap_or_default();
    if captured.len() != expected.len() {
        lines.push(format!(
            "errors: {} cases expected, {} captured",
            expected.len(),
            captured.len()
        ));
        return lines;
    }
    for (index, (actual, expected)) in captured.iter().zip(expected.iter()).enumerate() {
        let prefix = format!("errors[{index}]");
        if expected["name"] != Value::String(actual.name.clone()) {
            lines.push(format!(
                "{prefix} name: {} expected, {} captured",
                expected["name"], actual.name
            ));
        }
        if expected["isError"].as_bool() != Some(actual.is_error) {
            lines.push(format!(
                "{prefix} isError: {} expected, {} captured",
                expected["isError"], actual.is_error
            ));
        }
        if expected["text"].as_str() != Some(actual.text.as_str()) {
            lines.push(format!(
                "{prefix} text: {} expected, {} captured",
                expected["text"], actual.text
            ));
        }
        if let Some(line) = difference(
            &expected["structuredContent"],
            &actual.structured_content.clone().unwrap_or(Value::Null),
        ) {
            lines.push(format!("{prefix} structuredContent: {line}"));
        }
    }
    lines
}

pub fn compare(captured: &Captured, fixture: &Value) -> Vec<String> {
    let mut lines = Vec::new();
    let expected = &fixture["mcp"];
    for (label, actual, expected) in [
        ("initialize", &captured.initialize, &expected["initialize"]),
        ("tools", &captured.tools, &expected["tools"]),
        ("resources", &captured.resources, &expected["resources"]),
        ("templates", &captured.templates, &expected["templates"]),
    ] {
        if let Some(line) = difference(expected, actual) {
            lines.push(format!("mcp {label}: {line}"));
        }
    }
    if captured.get_status != expected["get"]["status"].as_u64().unwrap_or_default() as u16 {
        lines.push(format!(
            "mcp get: {} expected, {} captured",
            expected["get"]["status"], captured.get_status
        ));
    }
    if let Some(body) = expected["get"]["body"].as_str()
        && body != captured.get_body
    {
        lines.push(format!(
            "mcp get body: {body} expected, {} captured",
            captured.get_body
        ));
    }
    lines
}

async fn router(database: &Path, runtime: &Path) -> Result<Router, String> {
    let config = Arc::new(
        Config::from_lookup(|name| match name {
            "XBOCT_LOG_DB" => Some(database.display().to_string()),
            "XBOCT_LOG_MEDIA_DIR" => Some(runtime.join("media").display().to_string()),
            "XBOCT_LOG_BACKUP_DIR" => Some(runtime.join("backups").display().to_string()),
            "XBOCT_LOG_BACKUP_DISABLED" => Some("1".to_owned()),
            _ => None,
        })
        .map_err(|error| error.to_string())?,
    );
    let db = Arc::new(
        Db::open(&config.db_path)
            .await
            .map_err(|error| error.to_string())?,
    );
    Ok(app(AppState {
        db,
        config,
        events: Arc::new(Events::new()),
    }))
}

async fn rpc(
    router: &Router,
    method: &str,
    params: Value,
    session: Option<&str>,
) -> Result<(Value, Option<String>), String> {
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
        .oneshot(
            request
                .body(Body::from(body.to_string()))
                .map_err(|error| error.to_string())?,
        )
        .await
        .map_err(|error| error.to_string())?;
    let session = response
        .headers()
        .get("mcp-session-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    if response.status() != StatusCode::OK {
        let status = response.status();
        let text = String::from_utf8_lossy(
            &to_bytes(response.into_body(), usize::MAX)
                .await
                .map_err(|error| error.to_string())?,
        )
        .into_owned();
        return Err(format!("{method}: status {status} {text}"));
    }
    let text = String::from_utf8_lossy(
        &to_bytes(response.into_body(), usize::MAX)
            .await
            .map_err(|error| error.to_string())?,
    )
    .into_owned();
    let payload = text
        .lines()
        .filter_map(|line| {
            let data = line.strip_prefix("data:")?;
            let data = data.strip_prefix(' ').unwrap_or(data);
            (!data.is_empty()).then_some(data)
        })
        .next_back()
        .unwrap_or(&text);
    let parsed: Value =
        serde_json::from_str(payload).map_err(|error| format!("{method}: {error} in {payload}"))?;
    if let Some(error) = parsed.get("error").filter(|error| !error.is_null()) {
        return Err(format!("{method}: {error}"));
    }
    Ok((
        parsed.get("result").cloned().unwrap_or(Value::Null),
        session,
    ))
}

fn normalize_resources(resources: &Value, runtime: &Path, now_ms: i64) -> Value {
    let mut identities = HashMap::new();
    if let Some(items) = resources["resources"].as_array() {
        for (index, resource) in items.iter().enumerate() {
            let Some(uri) = resource["uri"].as_str() else {
                continue;
            };
            let Some(id) = uri.strip_prefix(ATTACHMENT_URI_PREFIX) else {
                continue;
            };
            identities.insert(id.to_lowercase(), format!("<attachment:{}>", index + 1));
        }
    }
    let runtime_text = runtime.to_string_lossy().into_owned();
    Normalizer::new(now_ms, Some(runtime_text.as_str()), identities).normalize(resources)
}
