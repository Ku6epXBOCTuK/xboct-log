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
use xboct_log_ops::{
    Ctx, Kind, OpInfo, dispatch, metadata, patch_fields, schema_of, tool_schema,
    validation as ops_validation,
};

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
pub(crate) struct CatalogEntry {
    name: String,
    description: String,
    params: Vec<CatalogParam>,
}

#[derive(serde::Serialize, schemars::JsonSchema)]
pub(crate) struct CatalogParam {
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
    tags_hint: Arc<String>,
    auto_backup: Arc<AutoBackup>,
}

impl Backlog {
    pub fn new(db: Arc<Db>, config: Arc<Config>, events: Arc<Events>, tags_hint: String) -> Self {
        Self {
            db,
            config,
            events,
            tags_hint: Arc::new(tags_hint),
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
            .with_instructions(mcp_text::build_instructions(
                &tool_names(),
                &everyday_arguments(),
                &self.tags_hint,
            ))
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
        Ok(ListToolsResult::with_all_items(tools(&self.db).await?))
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
        let tags_changed = matches!(name.as_str(), "tags_create" | "tags_update" | "tags_rename")
            && tool_result.is_error != Some(true);
        let result: CallToolResponse = tool_result.into();

        if name.starts_with("attachments_") || name.starts_with("documents_") {
            let _ = context.peer.notify_resource_list_changed().await;
        }
        if tags_changed {
            let _ = context.peer.notify_tool_list_changed().await;
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

async fn tools(db: &Db) -> Result<Vec<Tool>, McpError> {
    let hint = mcp_text::active_tags_hint(db)
        .await
        .map_err(|error| McpError::internal_error(error.message().to_string(), None))?;
    let mut tools = Vec::new();
    for info in metadata().iter().filter(|info| info.mcp) {
        if info.lazy {
            let brief = brief_description(info.name, info.description);
            let description = if needs_tags_hint(info.name) {
                format!("{brief}\n\n{hint}")
            } else {
                brief
            };
            tools.push(Tool::new_with_raw(
                info.name,
                Some(Cow::Owned(description)),
                parse_schema(json!({"type": "object"})),
            ));
            continue;
        }
        let (input, output) = tool_schema(info.name).ok_or_else(|| {
            McpError::internal_error(format!("no schema for the tool {}", info.name), None)
        })?;
        let description = if needs_tags_hint(info.name) {
            Cow::Owned(format!("{}\n\n{}", info.description, hint))
        } else {
            Cow::Borrowed(info.description)
        };
        let input = if needs_tags_hint(info.name) {
            let mut input = input;
            add_tags_hint(&mut input, &hint);
            input
        } else {
            input
        };
        tools.push(
            Tool::new_with_raw(info.name, Some(description), parse_schema(input))
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

mod catalog;
mod dispatch;
mod validation;
pub(crate) use catalog::*;
pub(crate) use validation::*;

#[cfg(test)]
mod tests;
