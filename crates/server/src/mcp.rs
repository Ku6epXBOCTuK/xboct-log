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
    ActivitySource, AppError, Attachment, AttachmentContents, AutoBackup, Config, Db, Document,
    Events, RequestLogEntry, RequestStatus, attachment_by_id, attachment_format,
    list_all_attachments, list_documents, read_attachment_file, record_request, require_document,
};
use xboct_log_ops::{Ctx, Kind, OpInfo, dispatch, metadata, patch_fields, schema_of, tool_schema};

use crate::mcp_text;

const ATTACHMENT_INDEX_URI: &str = "xboct-log://attachments";
const ATTACHMENT_URI_PREFIX: &str = "xboct-log://attachment/";
const DOCUMENT_INDEX_URI: &str = "xboct-log://documents";
const DOCUMENT_URI_PREFIX: &str = "xboct-log://document/";
const CLIENT_LABEL_MAX_LENGTH: usize = 80;
const MAX_DESCRIPTION_RESULTS: usize = 8;

#[derive(serde::Serialize, schemars::JsonSchema)]
struct ReadAttachmentInput {
    #[schemars(description = "The `id` field of an item from attachments_list.")]
    attachment_id: String,
}

#[derive(serde::Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
struct ToolDescriptionInput {
    #[schemars(description = "Words to match against a tool name or its description.")]
    query: String,
}

#[derive(serde::Serialize, schemars::JsonSchema)]
struct ToolDescriptionOutput {
    items: Vec<CatalogEntry>,
}

#[derive(serde::Serialize, schemars::JsonSchema)]
struct CatalogEntry {
    name: String,
    description: String,
    params: Vec<CatalogParam>,
}

#[derive(serde::Serialize, schemars::JsonSchema)]
struct CatalogParam {
    name: String,
    required: bool,
    description: String,
}

#[derive(serde::Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
struct CallInput {
    #[schemars(description = "The exact tool name returned by xboct_log_tool_description.")]
    tool: String,
    #[schemars(description = "The arguments of that tool as a JSON object.")]
    args: Value,
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
        let requested = request.name.clone();
        let arguments = Value::Object(request.arguments.unwrap_or_default());
        let client = client_label(&context);

        let (name, arguments, tool_result) =
            self.call_named(&requested, arguments, client.clone()).await;
        let (status, error_kind, error_message) = match failure_details(&tool_result) {
            Some((kind, message)) => (RequestStatus::Error, Some(kind), Some(message)),
            None => (RequestStatus::Ok, None, None),
        };
        let result: CallToolResponse = tool_result.into();

        if name.starts_with("attachments_") || name.starts_with("documents_") {
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
            Resource::new(DOCUMENT_INDEX_URI, "documents")
                .with_title(mcp_text::DOCUMENTS_RESOURCES_TITLE)
                .with_description(mcp_text::DOCUMENTS_RESOURCES_DESCRIPTION)
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
        for document in list_documents(&self.db, None).await.map_err(internal)? {
            resources.push(document_resource(&document));
        }
        Ok(ListResourcesResult::with_all_items(resources))
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, McpError> {
        let attachment = ResourceTemplate::new("xboct-log://attachment/{id}", "attachment")
            .with_title(mcp_text::TEMPLATE_TITLE)
            .with_description(mcp_text::TEMPLATE_DESCRIPTION)
            .with_mime_type("application/octet-stream");
        let document = ResourceTemplate::new("xboct-log://document/{key_or_id}", "document")
            .with_title(mcp_text::DOCUMENT_TEMPLATE_TITLE)
            .with_description(mcp_text::DOCUMENT_TEMPLATE_DESCRIPTION)
            .with_mime_type("text/markdown");
        Ok(ListResourceTemplatesResult::with_all_items(vec![
            attachment, document,
        ]))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, McpError> {
        let uri = request.uri;
        if uri == DOCUMENT_INDEX_URI {
            let listed: Vec<Value> = list_documents(&self.db, None)
                .await
                .map_err(internal)?
                .into_iter()
                .map(|document| {
                    json!({
                        "id": document.id,
                        "key": document.key,
                        "project_id": document.project_id,
                        "kind": document.kind.as_str(),
                        "title": document.title,
                        "status": document.status.as_str(),
                        "uri": format!("{DOCUMENT_URI_PREFIX}{}", document.key),
                    })
                })
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
        if let Some(id) = uri.strip_prefix(DOCUMENT_URI_PREFIX) {
            let document = require_document(&self.db, id).await.map_err(|error| {
                McpError::resource_not_found(
                    uri.clone(),
                    Some(json!({ "uri": uri, "error": error.message() })),
                )
            })?;
            return Ok(
                ReadResourceResult::new(vec![ResourceContents::TextResourceContents {
                    uri: uri.clone(),
                    mime_type: Some("text/markdown".to_string()),
                    text: document.body,
                    meta: None,
                }])
                .into(),
            );
        }
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
    async fn call_named(
        &self,
        name: &str,
        arguments: Value,
        client: Option<String>,
    ) -> (String, Value, CallToolResult) {
        if name == "xboct_log_call" {
            let input: CallInput = match serde_json::from_value(arguments.clone()) {
                Ok(input) => input,
                Err(error) => {
                    let message = format!("Input validation error for xboct_log_call: {error}");
                    return (name.to_string(), arguments, bare_failure(&message));
                }
            };
            if input.tool == "xboct_log_call" || input.tool == "xboct_log_tool_description" {
                let message =
                    "xboct_log_call cannot call xboct_log_tool_description or xboct_log_call";
                return (name.to_string(), arguments, bare_failure(message));
            }
            return self.call_direct(&input.tool, input.args, client).await;
        }
        if name == "xboct_log_tool_description" {
            let result = match serde_json::from_value::<ToolDescriptionInput>(arguments.clone()) {
                Ok(input) => self.call_tool_description(&input.query),
                Err(error) => {
                    let message =
                        format!("Input validation error for xboct_log_tool_description: {error}");
                    bare_failure(&message)
                }
            };
            return (name.to_string(), arguments, result);
        }
        self.call_direct(name, arguments, client).await
    }

    async fn call_direct(
        &self,
        name: &str,
        arguments: Value,
        client: Option<String>,
    ) -> (String, Value, CallToolResult) {
        let arguments = normalize_arguments(name, arguments);
        let result = if let Some(message) = validation_error(name, &arguments) {
            bare_failure(&message)
        } else if name == "attachments_read" {
            self.call_attachments_read(&arguments).await
        } else {
            let ctx = self.context(client);
            match dispatch(&ctx, name, arguments.clone()).await {
                Ok(value) => success(value),
                Err(error) => failure(&error),
            }
        };
        (name.to_string(), arguments, result)
    }

    fn call_tool_description(&self, query: &str) -> CallToolResult {
        let needle = query.trim().to_lowercase();
        let words: Vec<&str> = needle.split_whitespace().collect();
        let mut found: Vec<(usize, CatalogEntry)> = tool_catalog()
            .into_iter()
            .filter_map(|info| {
                let name = info.name.to_lowercase();
                let description = info.description.to_lowercase();
                let mut score = 0;
                if !needle.is_empty() {
                    if name.contains(&needle) {
                        score += 6;
                    }
                    if description.contains(&needle) {
                        score += 3;
                    }
                    for word in &words {
                        if name.contains(word) {
                            score += 2;
                        }
                        if description.contains(word) {
                            score += 1;
                        }
                    }
                    if score == 0 {
                        return None;
                    }
                }
                let (input, _) = match tool_schema(info.name) {
                    Some(schema) => schema,
                    None if info.name == "attachments_read" => {
                        (schema_of::<ReadAttachmentInput>(), Value::Null)
                    }
                    None => return None,
                };
                Some((
                    score,
                    CatalogEntry {
                        name: info.name.to_string(),
                        description: info.description.to_string(),
                        params: catalog_params(&input),
                    },
                ))
            })
            .collect();
        found.sort_by(|left, right| {
            right
                .0
                .cmp(&left.0)
                .then_with(|| left.1.name.cmp(&right.1.name))
        });
        found.truncate(MAX_DESCRIPTION_RESULTS);
        let items = found.into_iter().map(|(_, entry)| entry).collect();
        success(json!(ToolDescriptionOutput { items }))
    }

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

fn document_resource(document: &Document) -> Resource {
    Resource::new(
        format!("{DOCUMENT_URI_PREFIX}{}", document.key),
        format!("{} {}", document.key, document.title),
    )
    .with_title(mcp_text::DOCUMENT_TEMPLATE_TITLE)
    .with_description(mcp_text::DOCUMENT_TEMPLATE_DESCRIPTION)
    .with_mime_type("text/markdown")
}

fn attachment_mime(file_name: &str) -> String {
    attachment_format(file_name)
        .map(|format| format.mime.to_string())
        .unwrap_or_else(|| "application/octet-stream".to_string())
}

fn tools() -> Result<Vec<Tool>, McpError> {
    let mut tools = Vec::new();
    for info in metadata().iter().filter(|info| info.mcp) {
        if info.lazy {
            tools.push(Tool::new_with_raw(
                info.name,
                Some(Cow::Owned(brief_description(info.name, info.description))),
                parse_schema(json!({"type": "object"})),
            ));
            continue;
        }
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
    tools.push(Tool::new_with_raw(
        "attachments_read",
        Some(Cow::Owned(brief_description(
            "attachments_read",
            mcp_text::ATTACHMENTS_READ_DESCRIPTION,
        ))),
        parse_schema(json!({"type": "object"})),
    ));
    tools.push(
        Tool::new_with_raw(
            "xboct_log_tool_description",
            Some(Cow::Borrowed(mcp_text::TOOL_DESCRIPTION_DESCRIPTION)),
            parse_schema(schema_of::<ToolDescriptionInput>()),
        )
        .with_raw_output_schema(parse_schema(schema_of::<ToolDescriptionOutput>())),
    );
    tools.push(Tool::new_with_raw(
        "xboct_log_call",
        Some(Cow::Borrowed(mcp_text::XBOCT_LOG_CALL_DESCRIPTION)),
        parse_schema(schema_of::<CallInput>()),
    ));
    Ok(tools)
}

fn tool_catalog() -> Vec<OpInfo> {
    let mut infos: Vec<OpInfo> = metadata()
        .into_iter()
        .filter(|info| info.mcp && info.lazy)
        .collect();
    infos.push(OpInfo {
        name: "attachments_read",
        kind: Kind::Query,
        mcp: true,
        lazy: true,
        description: mcp_text::ATTACHMENTS_READ_DESCRIPTION,
        entity: None,
    });
    infos
}

fn catalog_params(schema: &Value) -> Vec<CatalogParam> {
    let Some(properties) = schema.get("properties").and_then(Value::as_object) else {
        return Vec::new();
    };
    let required: Vec<&str> = schema
        .get("required")
        .and_then(Value::as_array)
        .map(|fields| fields.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    properties
        .iter()
        .map(|(name, property)| CatalogParam {
            name: name.clone(),
            required: required.contains(&name.as_str()),
            description: property
                .get("description")
                .and_then(Value::as_str)
                .map(|text| clip(text, 160))
                .unwrap_or_default(),
        })
        .collect()
}

fn brief_description(name: &str, description: &str) -> String {
    let sentence = description.split(". ").next().unwrap_or(description);
    let sentence = clip(sentence.trim(), 140);
    let sentence = sentence.trim_end_matches(['.', ',', ' ']);
    format!(
        "{sentence}. Get the argument schema with xboct_log_tool_description {{query: '{name}'}}."
    )
}

fn clip(text: &str, limit: usize) -> String {
    let mut clipped = String::new();
    for character in text.chars() {
        if clipped.len() + character.len_utf8() > limit {
            break;
        }
        clipped.push(character);
    }
    if clipped.len() < text.len() {
        clipped.push_str("...");
    }
    clipped
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
    use xboct_log_core::{Config, Events, OpName};

    async fn backlog() -> Backlog {
        let db = Db::open(":memory:").await.unwrap();
        db.migrate().await.unwrap();
        let config =
            Config::from_lookup(|name| (name == "XBOCT_LOG_DB").then(|| ":memory:".to_string()))
                .unwrap();
        Backlog::new(Arc::new(db), Arc::new(config), Arc::new(Events::new()))
    }

    #[test]
    fn lists_every_tool_with_brief_descriptions_for_rare_ones() {
        let listed = tools().unwrap();
        let names: Vec<String> = listed.iter().map(|tool| tool.name.to_string()).collect();
        assert_eq!(
            names.len(),
            metadata().iter().filter(|info| info.mcp).count() + 3
        );
        for expected in [
            "tasks_list",
            "plans_notes_add",
            "tasks_delete",
            "plans_notes_delete",
            "attachments_read",
            "xboct_log_tool_description",
            "xboct_log_call",
        ] {
            assert!(names.iter().any(|name| name == expected), "{expected}");
        }

        let find = |name: &str| {
            listed
                .iter()
                .find(|tool| tool.name == name)
                .unwrap_or_else(|| panic!("{name} is listed"))
        };
        let common = find("tasks_list");
        let full = metadata()
            .into_iter()
            .find(|info| info.name == "tasks_list")
            .unwrap()
            .description;
        assert_eq!(common.description.as_deref(), Some(full));
        assert!(common.output_schema.is_some());
        assert!(common.input_schema.contains_key("properties"));

        let rare = find("tasks_delete");
        let brief = rare.description.as_deref().unwrap();
        assert!(brief.contains("Get the argument schema"), "{brief}");
        assert_eq!(
            &*rare.input_schema,
            json!({"type":"object"}).as_object().unwrap()
        );
        assert!(rare.output_schema.is_none());

        let attachment = find("attachments_read");
        assert!(
            attachment
                .description
                .as_deref()
                .unwrap()
                .contains("xboct_log_tool_description")
        );
        assert!(attachment.output_schema.is_none());
    }

    #[tokio::test]
    async fn tool_description_and_call_reach_rare_tools() {
        let backlog = backlog().await;
        let (name, _, result) = backlog
            .call_named(
                "xboct_log_tool_description",
                json!({"query": "restore deleted task"}),
                None,
            )
            .await;
        assert_eq!(name, "xboct_log_tool_description");
        assert_eq!(result.is_error, None);
        let payload = result.structured_content.unwrap();
        let items = payload["items"].as_array().unwrap();
        assert!(items.iter().any(|item| item["name"] == "tasks_restore"));
        assert!(items.iter().any(|item| {
            item["params"]
                .as_array()
                .is_some_and(|params| params.iter().any(|param| param["name"] == "task_id"))
        }));

        let (_, _, result) = backlog
            .call_named(
                "xboct_log_tool_description",
                json!({"query": "attachment file"}),
                None,
            )
            .await;
        let payload = result.structured_content.unwrap();
        assert!(
            payload["items"]
                .as_array()
                .unwrap()
                .iter()
                .any(|item| item["name"] == "attachments_read")
        );

        let (_, _, result) = backlog
            .call_named(
                "xboct_log_tool_description",
                json!({"query": "tasks_delete"}),
                None,
            )
            .await;
        let payload = result.structured_content.unwrap();
        let item = &payload["items"][0];
        let full = metadata()
            .into_iter()
            .find(|info| info.name == "tasks_delete")
            .unwrap()
            .description;
        assert_eq!(item["name"], "tasks_delete");
        assert_eq!(item["description"], full);

        let (name, args, result) = backlog
            .call_named(
                "xboct_log_call",
                json!({"tool": "request_log_list", "args": {}}),
                None,
            )
            .await;
        assert_eq!(name, "request_log_list");
        assert_eq!(args, json!({}));
        assert_eq!(result.is_error, None);

        let (_, _, result) = backlog
            .call_named("xboct_log_call", json!({"tool": "tasks_delete"}), None)
            .await;
        assert_eq!(result.is_error, Some(true));
    }

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

    #[test]
    fn create_many_item_schema_documents_required_fields_and_example() {
        let (input, _) = tool_schema("tasks_create_many").expect("tasks_create_many schema");
        let items = &input["properties"]["items"];
        let description = items["description"].as_str().unwrap_or_default();
        assert!(
            description.contains("\"items\":[{\"project_id\":\"brul\""),
            "items description: {description}"
        );
        let item = deref(&items["items"], &input);
        let required = item["required"].as_array().expect("item required fields");
        assert!(
            required
                .iter()
                .any(|field| field.as_str() == Some("project_id"))
        );
        assert!(required.iter().any(|field| field.as_str() == Some("title")));
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
