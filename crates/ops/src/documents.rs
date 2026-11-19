use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::Value;
use xboct_log_core::{
    AppError, Document, DocumentKind, DocumentList, DocumentPatch, DocumentQuery, Entity, OpName,
    Result, TextRevision, create_document, delete_document, link_document_to_plan,
    list_deleted_documents, list_document_revisions, query_documents, require_document,
    restore_document, unlink_document_from_plan, update_document,
};

use crate::{Ctx, Items, Kind, Op, plans::Empty};

pub struct DocumentsList;

impl Op for DocumentsList {
    const NAME: OpName = OpName::DocumentsList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = DocumentQuery;
    type Output = DocumentList;

    fn description() -> &'static str {
        crate::descriptions::DOCUMENTS_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        query_documents(&ctx.db, None, &input).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DocumentIdInput {
    pub document_id: String,
}

pub struct DocumentsGet;

impl Op for DocumentsGet {
    const NAME: OpName = OpName::DocumentsGet;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = DocumentIdInput;
    type Output = Document;

    fn description() -> &'static str {
        crate::descriptions::DOCUMENTS_GET
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        require_document(&ctx.db, &input.document_id).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateInput {
    pub project_id: String,
    pub kind: DocumentKind,
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    #[schemars(description = "Path of the markdown file this document was imported from.")]
    #[serde(default)]
    pub source_file: Option<String>,
}

pub struct DocumentsCreate;

impl Op for DocumentsCreate {
    const NAME: OpName = OpName::DocumentsCreate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = CreateInput;
    type Output = Document;

    fn description() -> &'static str {
        crate::descriptions::DOCUMENTS_CREATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Documents)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        create_document(
            &ctx.db,
            &input.project_id,
            input.kind,
            &input.title,
            input.body.as_deref().unwrap_or(""),
            input.source_file.as_deref(),
        )
        .await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateInput {
    pub document_id: String,
    #[serde(default)]
    pub patch: Option<Value>,
    #[serde(flatten)]
    pub flat: DocumentPatch,
    pub expected_updated_at: Option<String>,
}

pub struct DocumentsUpdate;

impl Op for DocumentsUpdate {
    const NAME: OpName = OpName::DocumentsUpdate;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = UpdateInput;
    type Output = Document;

    fn description() -> &'static str {
        crate::descriptions::DOCUMENTS_UPDATE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Documents)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        let patch: DocumentPatch = match input.patch {
            Some(value) => serde_json::from_value(value)
                .map_err(|error| AppError::validation(error.to_string()))?,
            None => input.flat,
        };
        update_document(
            &ctx.db,
            &input.document_id,
            &patch,
            input.expected_updated_at.as_deref(),
        )
        .await
    }
}

pub struct DocumentsDelete;

impl Op for DocumentsDelete {
    const NAME: OpName = OpName::DocumentsDelete;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = DocumentIdInput;
    type Output = Document;

    fn description() -> &'static str {
        crate::descriptions::DOCUMENTS_DELETE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Documents)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        delete_document(&ctx.db, &input.document_id).await
    }
}

pub struct DocumentsRestore;

impl Op for DocumentsRestore {
    const NAME: OpName = OpName::DocumentsRestore;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = DocumentIdInput;
    type Output = Document;

    fn description() -> &'static str {
        crate::descriptions::DOCUMENTS_RESTORE
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Documents)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        restore_document(&ctx.db, &input.document_id).await
    }
}

pub struct DocumentsDeletedList;

impl Op for DocumentsDeletedList {
    const NAME: OpName = OpName::DocumentsDeletedList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = Empty;
    type Output = Items<Document>;

    fn description() -> &'static str {
        crate::descriptions::DOCUMENTS_DELETED_LIST
    }

    async fn run(ctx: &Ctx, _input: Self::Input) -> Result<Self::Output> {
        Ok(Items {
            items: list_deleted_documents(&ctx.db).await?,
        })
    }
}

pub struct DocumentsRevisionsList;

impl Op for DocumentsRevisionsList {
    const NAME: OpName = OpName::DocumentsRevisionsList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = DocumentIdInput;
    type Output = Items<TextRevision>;

    fn description() -> &'static str {
        crate::descriptions::DOCUMENTS_REVISIONS_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        Ok(Items {
            items: list_document_revisions(&ctx.db, &input.document_id).await?,
        })
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PlanDocumentsListInput {
    pub plan_id: String,
    #[serde(flatten)]
    pub query: DocumentQuery,
}

pub struct PlansDocumentsList;

impl Op for PlansDocumentsList {
    const NAME: OpName = OpName::PlansDocumentsList;
    const KIND: Kind = Kind::Query;
    const MCP: bool = true;

    type Input = PlanDocumentsListInput;
    type Output = DocumentList;

    fn description() -> &'static str {
        crate::descriptions::PLANS_DOCUMENTS_LIST
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        query_documents(&ctx.db, Some(&input.plan_id), &input.query).await
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PlanDocumentInput {
    pub plan_id: String,
    pub document_id: String,
}

pub struct PlansDocumentsLink;

impl Op for PlansDocumentsLink {
    const NAME: OpName = OpName::PlansDocumentsLink;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = PlanDocumentInput;
    type Output = Document;

    fn description() -> &'static str {
        crate::descriptions::PLANS_DOCUMENTS_LINK
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        link_document_to_plan(&ctx.db, &input.plan_id, &input.document_id).await?;
        require_document(&ctx.db, &input.document_id).await
    }
}

pub struct PlansDocumentsUnlink;

impl Op for PlansDocumentsUnlink {
    const NAME: OpName = OpName::PlansDocumentsUnlink;
    const KIND: Kind = Kind::Command;
    const MCP: bool = true;

    type Input = PlanDocumentInput;
    type Output = Document;

    fn description() -> &'static str {
        crate::descriptions::PLANS_DOCUMENTS_UNLINK
    }

    fn entity() -> Option<Entity> {
        Some(Entity::Plans)
    }

    async fn run(ctx: &Ctx, input: Self::Input) -> Result<Self::Output> {
        unlink_document_from_plan(&ctx.db, &input.plan_id, &input.document_id).await?;
        require_document(&ctx.db, &input.document_id).await
    }
}
