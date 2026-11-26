use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, QueryBuilder, Row, sqlite::SqliteRow};

use crate::{
    AppError, Db, DocumentId, DocumentKey, Limit, Offset, ProjectId, Result, Tx,
    common::resolve_plan_id,
    fetch::{fetch_by_id, unexpected},
    query::{FieldSelection, OneOrList, Order, push_in_text, push_like},
    validate_limit, validate_offset,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum DocumentKind {
    Adr,
    Prd,
    Architecture,
    Research,
    Workflow,
    Guide,
    Spec,
}

impl DocumentKind {
    pub const ALL: [Self; 7] = [
        Self::Adr,
        Self::Prd,
        Self::Architecture,
        Self::Research,
        Self::Workflow,
        Self::Guide,
        Self::Spec,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Adr => "adr",
            Self::Prd => "prd",
            Self::Architecture => "architecture",
            Self::Research => "research",
            Self::Workflow => "workflow",
            Self::Guide => "guide",
            Self::Spec => "spec",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|kind| kind.as_str() == value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum DocumentStatus {
    Draft,
    Accepted,
    Superseded,
    Archived,
}

impl DocumentStatus {
    pub const ALL: [Self; 4] = [
        Self::Draft,
        Self::Accepted,
        Self::Superseded,
        Self::Archived,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Accepted => "accepted",
            Self::Superseded => "superseded",
            Self::Archived => "archived",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|status| status.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct Document {
    pub id: String,
    pub project_id: String,
    pub number: i64,
    pub key: String,
    pub kind: DocumentKind,
    pub title: String,
    pub body: String,
    pub status: DocumentStatus,
    pub source_file: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Default, Clone, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DocumentPatch {
    #[serde(default)]
    pub kind: Option<DocumentKind>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub status: Option<DocumentStatus>,
    #[serde(default)]
    pub source_file: Option<Option<String>>,
}

fn default_document_limit() -> u32 {
    100
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum DocumentSort {
    Number,
    Key,
    Title,
    Kind,
    Status,
    CreatedAt,
    UpdatedAt,
    ClosedAt,
}

impl DocumentSort {
    fn descending_by_default(self) -> bool {
        matches!(self, Self::CreatedAt | Self::UpdatedAt | Self::ClosedAt)
    }
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct DocumentQuery {
    #[schemars(
        description = "Only documents of these projects: one project id or an array of them."
    )]
    pub project_id: Option<OneOrList<ProjectId>>,
    #[schemars(description = "Only documents of these kinds.")]
    pub kind: Option<OneOrList<DocumentKind>>,
    #[schemars(description = "Only documents with these statuses.")]
    pub status: Option<OneOrList<DocumentStatus>>,
    #[schemars(
        description = "Case-insensitive substring in title, key or source_file. The body is not searched."
    )]
    pub q: Option<String>,
    #[schemars(description = "Case-insensitive substring in the title.")]
    pub title: Option<String>,
    #[schemars(description = "Exact case-insensitive title.")]
    pub title_exact: Option<String>,
    #[schemars(description = "Case-insensitive substring in source_file.")]
    pub source_file: Option<String>,
    #[schemars(description = "Sort field. Defaults to number; date fields default to descending.")]
    pub sort: Option<DocumentSort>,
    #[schemars(description = "Sort direction; defaults to the sort field's natural direction.")]
    pub order: Option<Order>,
    #[schemars(description = "Return only soft-deleted documents. Overrides include_deleted.")]
    pub deleted_only: Option<bool>,
    #[schemars(
        description = "Fields to include in each item: a comma-separated string or an array of names. Supported fields: id, project_id, number, key, kind, title, body, short_body, status, source_file, created_at, updated_at, closed_at, deleted_at. Identity fields are always present; unknown names are ignored. Requesting 'body' also returns the full text."
    )]
    pub fields: Option<FieldSelection>,
    #[schemars(
        description = "Return the full body. By default each item carries short_body (first non-empty line, ~120 chars) instead."
    )]
    pub include_body: Option<bool>,
    #[schemars(
        description = "Include soft-deleted documents. By default they are hidden; with true the deleted_at field is populated."
    )]
    pub include_deleted: Option<bool>,
    #[schemars(
        description = "Maximum number of documents to return (default 100, max 1000). Combine with offset and the response total to paginate."
    )]
    #[serde(default = "default_document_limit")]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

impl Default for DocumentQuery {
    fn default() -> Self {
        Self {
            project_id: None,
            kind: None,
            status: None,
            q: None,
            title: None,
            title_exact: None,
            source_file: None,
            sort: None,
            order: None,
            deleted_only: None,
            fields: None,
            include_body: None,
            include_deleted: None,
            limit: default_document_limit(),
            offset: 0,
        }
    }
}

impl DocumentQuery {
    pub(crate) fn pagination(&self) -> Result<(Limit, Offset)> {
        Ok((
            validate_limit(Some(i64::from(self.limit)), 100, 1000)?,
            validate_offset(Some(i64::from(self.offset)))?,
        ))
    }
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DocumentView {
    pub id: String,
    pub project_id: String,
    pub number: i64,
    pub key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<DocumentKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub short_body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<DocumentStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

impl From<Document> for DocumentView {
    fn from(document: Document) -> Self {
        Self {
            id: document.id,
            project_id: document.project_id,
            number: document.number,
            key: document.key,
            kind: Some(document.kind),
            title: Some(document.title),
            body: Some(document.body),
            short_body: None,
            status: Some(document.status),
            source_file: document.source_file,
            created_at: Some(document.created_at),
            updated_at: Some(document.updated_at),
            closed_at: document.closed_at,
            deleted_at: document.deleted_at,
        }
    }
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum DocumentListEntry {
    Full(Document),
    Projected(DocumentView),
}

#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DocumentList {
    pub items: Vec<DocumentListEntry>,
    pub total: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct TextRevision {
    pub id: i64,
    pub entity: String,
    pub entity_id: String,
    pub field: String,
    pub body: String,
    pub created_at: String,
}

impl<'r> FromRow<'r, SqliteRow> for Document {
    fn from_row(row: &'r SqliteRow) -> sqlx::Result<Self> {
        let kind: String = row.get("kind");
        let status: String = row.get("status");
        Ok(Document {
            id: row.get("id"),
            project_id: row.get("project_id"),
            number: row.get("number"),
            key: row.get("key"),
            kind: DocumentKind::from_db(&kind).ok_or_else(|| {
                unexpected(format!(
                    "document {} has unknown kind {kind}",
                    row.get::<String, _>("id")
                ))
            })?,
            title: row.get("title"),
            body: row.get("body"),
            status: DocumentStatus::from_db(&status).ok_or_else(|| {
                unexpected(format!(
                    "document {} has unknown status {status}",
                    row.get::<String, _>("id")
                ))
            })?,
            source_file: row.get("source_file"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            closed_at: row.get("closed_at"),
            deleted_at: row.get("deleted_at"),
        })
    }
}

pub async fn get_document(db: &Db, id: &str) -> Result<Option<Document>> {
    fetch_by_id(
        sqlx::query("SELECT * FROM documents WHERE id = ?").bind(id),
        db.pool(),
    )
    .await
}

pub async fn get_document_by_key(db: &Db, key: &str) -> Result<Option<Document>> {
    fetch_by_id(
        sqlx::query("SELECT * FROM documents WHERE key = ?").bind(key),
        db.pool(),
    )
    .await
}

pub async fn resolve_document_id(db: &Db, id: &str) -> Result<String> {
    let raw = id.trim();
    if let Ok(id) = DocumentId::parse(raw) {
        return Ok(id.into_string());
    }
    let key = DocumentKey::parse(raw)?;
    let document = get_document_by_key(db, key.as_str())
        .await?
        .ok_or_else(|| AppError::not_found(format!("document {key} not found")))?;
    Ok(document.id)
}

pub async fn require_document(db: &Db, id: &str) -> Result<Document> {
    let id = resolve_document_id(db, id).await?;
    get_document(db, &id)
        .await?
        .ok_or_else(|| AppError::not_found(format!("document {id} not found")))
}

pub async fn list_documents(db: &Db, project_id: Option<&str>) -> Result<Vec<Document>> {
    let rows: Vec<Document> = match project_id {
        Some(id) => {
            sqlx::query_as::<_, Document>(
                "SELECT * FROM documents WHERE deleted_at IS NULL AND project_id = ?
                 ORDER BY project_id, number",
            )
            .bind(id)
            .fetch_all(db.pool())
            .await?
        }
        None => {
            sqlx::query_as::<_, Document>(
                "SELECT * FROM documents WHERE deleted_at IS NULL ORDER BY project_id, number",
            )
            .fetch_all(db.pool())
            .await?
        }
    };
    Ok(rows)
}

pub async fn list_deleted_documents(db: &Db) -> Result<Vec<Document>> {
    let rows = sqlx::query_as::<_, Document>(
        "SELECT * FROM documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .fetch_all(db.pool())
    .await?;
    Ok(rows)
}
mod query;
pub use query::{
    create_document, delete_document, documents_for_plan, link_document_to_plan,
    list_document_revisions, query_documents, restore_document, unlink_document_from_plan,
    update_document,
};

#[cfg(test)]
mod tests;
