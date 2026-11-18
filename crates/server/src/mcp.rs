use std::borrow::Cow;
use std::sync::Arc;
use std::time::Instant;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::Local;
use rmcp::ErrorData as McpError;
use rmcp::RoleServer;
use rmcp::handler::server::ServerHandler;
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, ImageContent,
    InitializeResult, JsonObject, ListResourceTemplatesResult, ListResourcesResult,
    ListToolsResult, PaginatedRequestParams, ReadResourceRequestParams, ReadResourceResponse,
    ReadResourceResult, Resource, ResourceContents, ResourceTemplate, ServerCapabilities, Tool,
};
use rmcp::service::RequestContext;
use serde_json::{Map, Value, json};
use xboct_log_core::{
    ActivitySource, AppError, Attachment, AttachmentContents, AttachmentId, AutoBackup, Config, Db,
    Events, RequestLogEntry, RequestStatus, attachment_by_id, attachment_format,
    list_all_attachments, read_attachment_file, record_request,
};
use xboct_log_ops::{Ctx, dispatch, metadata, patch_fields, schema_of, tool_schema};

use crate::mcp_text;

const ATTACHMENT_INDEX_URI: &str = "xboct-log://attachments";
const ATTACHMENT_URI_PREFIX: &str = "xboct-log://attachment/";
const CLIENT_LABEL_MAX_LENGTH: usize = 80;

#[derive(serde::Serialize, schemars::JsonSchema)]
struct ReadAttachmentInput {
    #[schemars(description = "The `id` field of an item from attachments_list.")]
    attachment_id: AttachmentId,
}

#[derive(serde::Serialize, schemars::JsonSchema)]
struct ReadAttachmentOutput {
    item: Attachment,
}

#[derive(Clone)]
pub struct Backlog {
    pub db: Arc<Db>,
    pub config: Arc<Config>,
    pub events: Arc<Events>,
    auto_backup: Arc<AutoBackup>,
}

impl Backlog {
    pub fn new(db: Arc<Db>, config: Arc<Config>, events: Arc<Events>) -> Self {
        Self {
            db,
            config,
            events,
            auto_backup: Arc::new(AutoBackup::new()),
        }
    }

    fn context(&self, client: Option<String>) -> Ctx {
        Ctx {
            auto_backup: self.auto_backup.clone(),
            source: ActivitySource::Mcp,
            client,
            ..Ctx::new(self.db.clone(), self.events.clone(), self.config.clone())
        }
    }

    fn media_dir(&self) -> std::path::PathBuf {
        self.config.resolved_media_dir()
    }

    async fn attachments(&self) -> Result<Vec<Attachment>, AppError> {
        list_all_attachments(&self.db, &self.media_dir()).await
    }

    async fn read_attachment(
        &self,
        id: &str,
    ) -> Result<(Attachment, AttachmentContents), AppError> {
        let media_dir = self.media_dir();
        let attachment = attachment_by_id(&self.db, &media_dir, id)
            .await?
            .ok_or_else(|| AppError::not_found(format!("no attachment with the id {id}")))?;
        let contents = read_attachment_file(&self.db, &media_dir, id).await?;
        Ok((attachment, contents))
    }
}

impl ServerHandler for Backlog {
    fn get_info(&self) -> InitializeResult {
        let capabilities = ServerCapabilities::builder()
            .enable_tools()
            .enable_tool_list_changed()
            .enable_resources()
            .enable_resources_list_changed()
            .build();
        InitializeResult::new(capabilities)
            .with_instructions(mcp_text::INSTRUCTIONS)
            .with_server_info(rmcp::model::Implementation::new(
                crate::APP_NAME,
                env!("CARGO_PKG_VERSION"),
            ))
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult::with_all_items(tools()?))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        let started = Instant::now();
        let name = request.name.clone();
        let arguments = Value::Object(request.arguments.unwrap_or_default());
        let arguments = normalize_arguments(name.as_ref(), arguments);
        let client = client_label(&context);

        let (result, status, error_kind, error_message): (
            CallToolResponse,
            RequestStatus,
            Option<String>,
            Option<String>,
        ) = if let Some(message) = validation_error(name.as_ref(), &arguments) {
            (
                bare_failure(&message).into(),
                RequestStatus::Error,
                Some("validation".to_string()),
                Some(message),
            )
        } else {
            let tool_result = if name == "attachments_read" {
                self.call_attachments_read(&arguments).await
            } else {
                let ctx = self.context(client.clone());
                match dispatch(&ctx, name.as_ref(), arguments.clone()).await {
                    Ok(value) => success(value),
                    Err(error) => failure(&error),
                }
            };
            let (status, error_kind, error_message) = match failure_details(&tool_result) {
                Some((kind, message)) => (RequestStatus::Error, Some(kind), Some(message)),
                None => (RequestStatus::Ok, None, None),
            };
            (tool_result.into(), status, error_kind, error_message)
        };

        if name.starts_with("attachments_") {
            let _ = context.peer.notify_resource_list_changed().await;
        }

        let entry = RequestLogEntry {
            op: name.to_string(),
            client,
            params: arguments,
            status,
            error_kind,
            error_message,
            duration_ms: started.elapsed().as_millis() as i64,
        };
        if let Err(error) = record_request(&self.db, &entry, Local::now()).await {
            tracing::warn!(?error, op = %entry.op, "request log write failed");
        }
        Ok(result)
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        let mut resources = vec![
            Resource::new(ATTACHMENT_INDEX_URI, "attachments")
                .with_title(mcp_text::RESOURCES_TITLE)
                .with_description(mcp_text::RESOURCES_DESCRIPTION)
                .with_mime_type("application/json"),
        ];
        for attachment in self
            .attachments()
            .await
            .map_err(internal)?
            .into_iter()
            .filter(|item| !item.missing)
        {
            resources.push(attachment_resource(&attachment));
        }
        Ok(ListResourcesResult::with_all_items(resources))
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, McpError> {
        let template = ResourceTemplate::new("xboct-log://attachment/{id}", "attachment")
            .with_title(mcp_text::TEMPLATE_TITLE)
            .with_description(mcp_text::TEMPLATE_DESCRIPTION)
            .with_mime_type("application/octet-stream");
        Ok(ListResourceTemplatesResult::with_all_items(vec![template]))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, McpError> {
        let uri = request.uri;
        if uri == ATTACHMENT_INDEX_URI {
            let listed: Vec<Attachment> = self
                .attachments()
                .await
                .map_err(internal)?
                .into_iter()
                .filter(|item| !item.missing)
                .collect();
            let text = serde_json::to_string(&listed)
                .map_err(|error| McpError::internal_error(error.to_string(), None))?;
            return Ok(
                ReadResourceResult::new(vec![ResourceContents::TextResourceContents {
                    uri: uri.clone(),
                    mime_type: Some("application/json".to_string()),
                    text,
                    meta: None,
                }])
                .into(),
            );
        }
        let id = uri.strip_prefix(ATTACHMENT_URI_PREFIX).ok_or_else(|| {
            McpError::resource_not_found(uri.clone(), Some(json!({ "uri": uri })))
        })?;
        let (attachment, contents) = self.read_attachment(id).await.map_err(internal)?;
        let blob = STANDARD.encode(&contents.data);
        Ok(
            ReadResourceResult::new(vec![ResourceContents::BlobResourceContents {
                uri: uri.clone(),
                mime_type: Some(attachment_mime(&attachment.file_name)),
                blob,
                meta: None,
            }])
            .into(),
        )
    }
}

impl Backlog {
    async fn call_attachments_read(&self, arguments: &Value) -> CallToolResult {
        let id = match arguments.get("attachment_id").and_then(Value::as_str) {
            Some(id) => id,
            None => {
                return failure(&AppError::validation(
                    "attachment_id: expected a string with the attachment id",
                ));
            }
        };
        let (attachment, contents) = match self.read_attachment(id).await {
            Ok(found) => found,
            Err(error) => return failure(&error),
        };
        let mime = attachment_mime(&attachment.file_name);
        let bytes = contents.data;
        let body = if mime.starts_with("image/") {
            ContentBlock::Image(ImageContent::new(STANDARD.encode(&bytes), mime))
        } else if mime.starts_with("text/") || mime == "application/json" {
            ContentBlock::text(String::from_utf8_lossy(&bytes).into_owned())
        } else {
            ContentBlock::text(format!("data:{mime};base64,{}", STANDARD.encode(&bytes)))
        };
        let item = json!({ "item": attachment });
        let mut result = CallToolResult::success(vec![
            body,
            ContentBlock::text(serde_json::to_string(&item).unwrap_or_default()),
        ]);
        result.structured_content = Some(item);
        settle_success(&mut result);
        result
    }
}

fn success(payload: Value) -> CallToolResult {
    let text = serde_json::to_string(&payload).unwrap_or_default();
    let mut result = CallToolResult::success(vec![ContentBlock::text(text)]);
    result.structured_content = Some(payload);
    settle_success(&mut result);
    result
}

fn failure(error: &AppError) -> CallToolResult {
    let message = error.message().to_string();
    let payload = json!({ "error": { "kind": error.kind(), "message": message } });
    let mut result = CallToolResult::error(vec![ContentBlock::text(message)]);
    result.structured_content = Some(payload);
    result.result_type = None;
    result
}

fn failure_details(result: &CallToolResult) -> Option<(String, String)> {
    if result.is_error != Some(true) {
        return None;
    }
    let payload = result.structured_content.as_ref()?;
    let error = payload.get("error")?;
    Some((
        error.get("kind")?.as_str()?.to_string(),
        error.get("message")?.as_str()?.to_string(),
    ))
}

fn bare_failure(message: &str) -> CallToolResult {
    let mut result = CallToolResult::error(vec![ContentBlock::text(message.to_string())]);
    result.result_type = None;
    result
}

fn settle_success(result: &mut CallToolResult) {
    result.result_type = None;
    result.is_error = None;
}

fn attachment_resource(attachment: &Attachment) -> Resource {
    Resource::new(
        attachment.uri.clone(),
        format!("{} {}", attachment.task_id, attachment.file_name),
    )
    .with_title(mcp_text::ATTACHMENT_TITLE)
    .with_description(mcp_text::TEMPLATE_DESCRIPTION)
    .with_mime_type(attachment_mime(&attachment.file_name))
}

fn attachment_mime(file_name: &str) -> String {
    attachment_format(file_name)
        .map(|format| format.mime.to_string())
        .unwrap_or_else(|| "application/octet-stream".to_string())
}

fn tools() -> Result<Vec<Tool>, McpError> {
    let mut tools = Vec::new();
    for info in metadata().iter().filter(|info| info.mcp) {
        let (input, output) = tool_schema(info.name).ok_or_else(|| {
            McpError::internal_error(format!("no schema for the tool {}", info.name), None)
        })?;
        tools.push(
            Tool::new_with_raw(
                info.name,
                Some(Cow::Borrowed(info.description)),
                parse_schema(input),
            )
            .with_raw_output_schema(parse_schema(output)),
        );
    }
    tools.push(
        Tool::new_with_raw(
            "attachments_read",
            Some(Cow::Borrowed(mcp_text::ATTACHMENTS_READ_DESCRIPTION)),
            parse_schema(schema_of::<ReadAttachmentInput>()),
        )
        .with_raw_output_schema(parse_schema(schema_of::<ReadAttachmentOutput>())),
    );
    Ok(tools)
}

fn parse_schema(mut schema: Value) -> Arc<JsonObject> {
    if let Value::Object(map) = &mut schema {
        map.remove("$schema");
    }
    match schema {
        Value::Object(map) => Arc::new(map),
        _ => Arc::new(JsonObject::new()),
    }
}

fn deref<'a>(mut schema: &'a Value, root: &'a Value) -> &'a Value {
    loop {
        if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
            let Some(name) = reference.rsplit('/').next() else {
                return schema;
            };
            let Some(target) = root
                .get("$defs")
                .or_else(|| root.get("definitions"))
                .and_then(|defs| defs.get(name))
            else {
                return schema;
            };
            schema = target;
            continue;
        }
        let Some(variants) = schema.get("anyOf").and_then(Value::as_array) else {
            return schema;
        };
        let mut concrete = variants
            .iter()
            .filter(|variant| variant.get("type").and_then(Value::as_str) != Some("null"));
        let (Some(only), None) = (concrete.next(), concrete.next()) else {
            return schema;
        };
        schema = only;
    }
}

fn internal(error: AppError) -> McpError {
    McpError::internal_error(error.message().to_string(), None)
}

fn client_label(context: &RequestContext<RoleServer>) -> Option<String> {
    let info = context.client_info()?;
    let label = if info.version.is_empty() {
        info.name.clone()
    } else {
        format!("{}/{}", info.name, info.version)
    };
    let mut printable = String::with_capacity(label.len());
    let mut spaced = false;
    for character in label.chars() {
        let code = character as u32;
        if code < 0x20 || code == 0x7f {
            if !spaced {
                printable.push(' ');
                spaced = true;
            }
        } else {
            printable.push(character);
            spaced = false;
        }
    }
    let trimmed = printable.split_whitespace().collect::<Vec<_>>().join(" ");
    if trimmed.is_empty() {
        return None;
    }
    let mut units = 0;
    let mut cut = trimmed.len();
    for (index, character) in trimmed.char_indices() {
        units += character.len_utf16();
        if units > CLIENT_LABEL_MAX_LENGTH {
            cut = index;
            break;
        }
    }
    Some(trimmed[..cut].to_string())
}

fn validation_error(name: &str, arguments: &Value) -> Option<String> {
    let schema = tool_schema(name)?.0;
    let properties = schema.get("properties")?.as_object()?;
    let allowed: Vec<String> = properties.keys().cloned().collect();
    let object = arguments.as_object()?;
    let unknown: Vec<&str> = object
        .keys()
        .filter(|key| !allowed.iter().any(|name| name == key.as_str()))
        .map(String::as_str)
        .collect();
    if !unknown.is_empty() {
        let mut message = format!(
            "Input validation error: Invalid arguments for tool {name}: Unknown parameter(s): {}.",
            unknown.join(", ")
        );
        let hints: Vec<String> = unknown
            .iter()
            .filter_map(|key| {
                suggestion(key, &allowed).map(|matched| format!("{key} -> {matched}"))
            })
            .collect();
        if !hints.is_empty() {
            message.push_str(&format!(" Did you mean: {}?", hints.join(", ")));
        }
        message.push_str(&format!(" Allowed parameters: {}", allowed.join(", ")));
        return Some(message);
    }

    let mut problems = Vec::new();
    for (key, property) in properties {
        let Some(value) = object.get(key) else {
            continue;
        };
        if value.is_null() {
            continue;
        }
        let Some(options) = deref(property, &schema)
            .get("enum")
            .and_then(Value::as_array)
        else {
            continue;
        };
        if options.iter().any(|option| option == value) {
            continue;
        }
        let rendered: Vec<String> = options
            .iter()
            .map(|option| format!("\"{}\"", option.as_str().unwrap_or_default()))
            .collect();
        problems.push(format!(
            "{key}: Invalid option: expected one of {}",
            rendered.join("|")
        ));
    }
    if let Some(required) = schema.get("required").and_then(Value::as_array) {
        for field in required {
            let Some(key) = field.as_str() else {
                continue;
            };
            if object.contains_key(key) {
                continue;
            }
            let Some(property) = properties.get(key).map(|property| deref(property, &schema))
            else {
                continue;
            };
            if property.get("default").is_some() {
                continue;
            }
            problems.push(format!(
                "{key}: Invalid input: expected {}, received undefined",
                expected_type(property)
            ));
        }
    }
    if problems.is_empty() {
        return None;
    }
    Some(format!(
        "Input validation error: Invalid arguments for tool {name}: {}",
        problems.join("; ")
    ))
}

fn expected_type(schema: &Value) -> &str {
    match schema.get("type") {
        Some(Value::String(name)) => name,
        Some(Value::Array(names)) => names
            .iter()
            .filter_map(Value::as_str)
            .find(|name| *name != "null")
            .unwrap_or("value"),
        _ => match schema.get("anyOf").and_then(Value::as_array) {
            Some(variants) => variants
                .iter()
                .find(|variant| variant.get("type").and_then(Value::as_str) != Some("null"))
                .map(expected_type)
                .unwrap_or("value"),
            None => "value",
        },
    }
}

fn suggestion<'a>(key: &str, allowed: &'a [String]) -> Option<&'a str> {
    let suffix = format!("_{key}");
    let endings: Vec<&String> = allowed
        .iter()
        .filter(|name| name.ends_with(&suffix))
        .collect();
    if endings.len() == 1 {
        return Some(endings[0]);
    }
    let mut nearest: Option<(&String, usize)> = None;
    for name in allowed {
        let distance = edit_distance(key, name);
        if distance <= 2 && nearest.is_none_or(|(_, best)| distance < best) {
            nearest = Some((name, distance));
        }
    }
    nearest.map(|(name, _)| name.as_str())
}

fn edit_distance(left: &str, right: &str) -> usize {
    let target: Vec<char> = right.chars().collect();
    let mut previous: Vec<usize> = (0..=target.len()).collect();
    let mut current = vec![0; target.len() + 1];
    for (row, source) in left.chars().enumerate() {
        current[0] = row + 1;
        for (column, value) in target.iter().enumerate() {
            let cost = usize::from(source != *value);
            current[column + 1] = (previous[column + 1] + 1)
                .min(current[column] + 1)
                .min(previous[column] + cost);
        }
        std::mem::swap(&mut previous, &mut current);
    }
    previous[target.len()]
}

fn normalize_arguments(name: &str, arguments: Value) -> Value {
    let mut arguments = match arguments {
        Value::Object(map) => map,
        other => return other,
    };
    if name == "tasks_update_many" {
        if let Some(Value::Array(items)) = arguments.get_mut("items") {
            for item in items {
                if let Value::Object(item) = item {
                    flatten_patch(item, patch_fields("tasks_update"));
                }
            }
        }
        return Value::Object(arguments);
    }
    flatten_patch(&mut arguments, patch_fields(name));
    Value::Object(arguments)
}

fn flatten_patch(arguments: &mut Map<String, Value>, fields: &[&str]) {
    let keys: Vec<String> = arguments
        .keys()
        .filter(|key| fields.contains(&key.as_str()))
        .cloned()
        .collect();
    let mut flat = Map::new();
    for key in keys {
        if let Some(value) = arguments.shift_remove(&key) {
            flat.insert(key, value);
        }
    }
    if flat.is_empty() {
        return;
    }
    match arguments.get_mut("patch") {
        Some(Value::Object(patch)) => {
            for (key, value) in flat {
                patch.entry(key).or_insert(value);
            }
        }
        _ => {
            arguments.insert("patch".to_string(), Value::Object(flat));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use xboct_log_core::OpName;

    #[test]
    fn lists_the_operation_names_in_the_activity_filter() {
        let (input, _) = tool_schema("activity_list").expect("activity_list schema");
        let op = deref(&input["properties"]["op"], &input);
        let names: Vec<String> = OpName::ALL
            .iter()
            .map(|name| name.as_str().to_string())
            .collect();
        assert_eq!(op["enum"], json!(names));
    }

    #[test]
    fn reads_the_error_kind_and_message_from_a_failed_call() {
        let result = failure(&AppError::validation("bad input"));
        assert_eq!(
            failure_details(&result),
            Some(("validation".to_string(), "bad input".to_string()))
        );
        assert_eq!(failure_details(&success(json!({"ok": true}))), None);
    }

    fn assert_refs_resolve(schema: &Map<String, Value>, name: &str) {
        let mut refs = Vec::new();
        collect_refs(&Value::Object(schema.clone()), &mut refs);
        let defs = schema.get("$defs").and_then(Value::as_object);
        for reference in refs {
            let Some(target) = reference.strip_prefix("#/$defs/") else {
                continue;
            };
            assert!(
                defs.is_some_and(|defs| defs.contains_key(target)),
                "{name} has unresolved $ref {reference}"
            );
        }
    }

    fn collect_refs(value: &Value, refs: &mut Vec<String>) {
        match value {
            Value::Object(object) => {
                if let Some(reference) = object.get("$ref").and_then(Value::as_str) {
                    refs.push(reference.to_string());
                }
                for nested in object.values() {
                    collect_refs(nested, refs);
                }
            }
            Value::Array(items) => {
                for item in items {
                    collect_refs(item, refs);
                }
            }
            _ => {}
        }
    }

    #[test]
    fn every_tool_schema_resolves_its_definitions() {
        for tool in tools().expect("tool definitions") {
            assert_refs_resolve(&tool.input_schema, &tool.name);
            if let Some(output) = &tool.output_schema {
                assert_refs_resolve(output, &tool.name);
            }
        }
    }
}
