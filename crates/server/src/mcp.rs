use std::borrow::Cow;
use std::sync::Arc;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
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
    ActivitySource, AppError, Attachment, AttachmentContents, AutoBackup, Config, Db, Events,
    attachment_by_id, attachment_format, list_all_attachments, read_attachment_file,
};
use xboct_log_ops::{Ctx, dispatch, metadata, tool_schema};

use crate::mcp_text;

const ATTACHMENT_INDEX_URI: &str = "xboct-log://attachments";
const ATTACHMENT_URI_PREFIX: &str = "xboct-log://attachment/";
const CLIENT_LABEL_MAX_LENGTH: usize = 80;

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
        if let Some((input, output)) = tool_schema("attachments_read") {
            tools.push(
                Tool::new_with_raw(
                    "attachments_read",
                    Some(Cow::Borrowed(mcp_text::ATTACHMENTS_READ_DESCRIPTION)),
                    parse_schema(input),
                )
                .with_raw_output_schema(parse_schema(output)),
            );
        }
        Ok(ListToolsResult::with_all_items(tools))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        let name = request.name.clone();
        let arguments = Value::Object(request.arguments.unwrap_or_default());
        if let Some(message) = validation_error(name.as_ref(), &arguments) {
            return Ok(bare_failure(&message).into());
        }
        let arguments = normalize_arguments(name.as_ref(), arguments);
        let result = if name == "attachments_read" {
            self.call_attachments_read(&arguments).await
        } else {
            let ctx = self.context(client_label(&context));
            match dispatch(&ctx, name.as_ref(), arguments).await {
                Ok(Value::Array(items)) => success(json!({ "items": items })),
                Ok(value) => success(value),
                Err(error) => failure(&error),
            }
        };
        if name.starts_with("attachments_") {
            let _ = context.peer.notify_resource_list_changed().await;
        }
        Ok(result.into())
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

fn parse_schema(text: &str) -> Arc<JsonObject> {
    let mut parsed: Value = serde_json::from_str(text).unwrap_or(Value::Null);
    crate::schema::describe_ops(&mut parsed);
    match parsed {
        Value::Object(map) => Arc::new(map),
        _ => Arc::new(JsonObject::new()),
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
    let schema: Value = serde_json::from_str(tool_schema(name)?.0).ok()?;
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
        let Some(options) = property.get("enum").and_then(Value::as_array) else {
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
            let Some(property) = properties.get(key) else {
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

fn patch_fields(name: &str) -> &'static [&'static str] {
    match name {
        "projects_update" => &["name", "archived", "repo"],
        "scopes_update" => &["name"],
        "tags_update" => &["archived"],
        "tasks_update" => &[
            "title",
            "description",
            "status",
            "priority",
            "is_epic",
            "epic_id",
            "scope_id",
            "scope",
            "source_file",
            "tags",
            "estimate",
            "assignee",
            "due_at",
            "blocked_reason",
        ],
        _ => &[],
    }
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
        let schema = parse_schema(input);
        let names: Vec<&str> = OpName::ALL.iter().map(|name| name.as_str()).collect();
        assert_eq!(schema["properties"]["op"]["enum"], json!(names));
    }
}
