use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, QueryBuilder, Row, sqlite::SqliteRow};

use crate::{
    AppError, Db, DocumentKey, Limit, Offset, ProjectId, Result, Tx,
    fetch::{fetch_by_id, unexpected},
    query::{FieldSelection, OneOrList, Order, like_pattern, push_in_text},
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
    if let Ok(uuid) = uuid::Uuid::parse_str(raw) {
        return Ok(uuid.hyphenated().to_string());
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

fn add_field(parsed: &mut Vec<String>, field: &str) {
    let field = field.trim();
    if field.is_empty() || parsed.iter().any(|known| known.as_str() == field) {
        return;
    }
    parsed.push(field.to_owned());
}

fn parse_document_fields(fields: Option<&FieldSelection>) -> Option<Vec<String>> {
    let fields = fields?;
    let mut parsed: Vec<String> = Vec::new();
    match fields {
        FieldSelection::Csv(raw) => {
            for field in raw.split(',') {
                add_field(&mut parsed, field);
            }
        }
        FieldSelection::List(values) => {
            for field in values {
                add_field(&mut parsed, field);
            }
        }
    }
    if parsed.is_empty() {
        None
    } else {
        Some(parsed)
    }
}

fn short_body(body: &str) -> String {
    let line = body
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("")
        .trim();
    let mut result: String = line.chars().take(120).collect();
    if line.chars().count() > 120 {
        result.push('…');
    }
    result
}

fn pick_document_fields(view: DocumentView, fields: Option<&[String]>) -> DocumentListEntry {
    let Some(fields) = fields else {
        return DocumentListEntry::Projected(view);
    };
    macro_rules! pick {
        ($($field:ident),* $(,)?) => {{
            let mut matched = false;
            $(
                if fields.iter().any(|name| name.as_str() == stringify!($field)) {
                    matched = true;
                }
            )*
            if !matched {
                return DocumentListEntry::Projected(view);
            }
            DocumentListEntry::Projected(DocumentView {
                $(
                    $field: if fields.iter().any(|name| name.as_str() == stringify!($field)) {
                        view.$field.clone()
                    } else {
                        None
                    },
                )*
                ..view
            })
        }};
    }
    pick!(
        kind,
        title,
        body,
        short_body,
        status,
        source_file,
        created_at,
        updated_at,
        closed_at,
        deleted_at,
    )
}

fn push_document_where(
    qb: &mut QueryBuilder<sqlx::Sqlite>,
    plan_id: Option<&str>,
    query: &DocumentQuery,
) {
    qb.push(" WHERE 1 = 1");
    if let Some(plan_id) = plan_id {
        qb.push(" AND pd.plan_id = ").push_bind(plan_id);
    }
    if let Some(projects) = &query.project_id {
        let values = projects.clone().into_vec();
        qb.push(" AND ");
        push_in_text(qb, "d.project_id", &values);
    }
    if let Some(kinds) = &query.kind {
        let values: Vec<&str> = kinds
            .clone()
            .into_vec()
            .iter()
            .map(|kind| kind.as_str())
            .collect();
        qb.push(" AND ");
        push_in_text(qb, "d.kind", &values);
    }
    if let Some(statuses) = &query.status {
        let values: Vec<&str> = statuses
            .clone()
            .into_vec()
            .iter()
            .map(|status| status.as_str())
            .collect();
        qb.push(" AND ");
        push_in_text(qb, "d.status", &values);
    }
    if let Some(term) = &query.q {
        let pattern = like_pattern(term);
        qb.push(" AND (ULOWER(d.title) LIKE ")
            .push_bind(pattern.clone())
            .push(" OR ULOWER(d.key) LIKE ")
            .push_bind(pattern.clone())
            .push(" OR ULOWER(COALESCE(d.source_file, '')) LIKE ")
            .push_bind(pattern)
            .push(")");
    }
    if let Some(title) = &query.title {
        qb.push(" AND ULOWER(d.title) LIKE ")
            .push_bind(like_pattern(title));
    }
    if let Some(title) = &query.title_exact {
        qb.push(" AND ULOWER(d.title) = ")
            .push_bind(title.to_lowercase());
    }
    if let Some(source) = &query.source_file {
        qb.push(" AND ULOWER(COALESCE(d.source_file, '')) LIKE ")
            .push_bind(like_pattern(source));
    }
    if query.deleted_only == Some(true) {
        qb.push(" AND d.deleted_at IS NOT NULL");
    } else if query.include_deleted != Some(true) {
        qb.push(" AND d.deleted_at IS NULL");
    }
}

fn push_document_order(qb: &mut QueryBuilder<sqlx::Sqlite>, query: &DocumentQuery) {
    let sort = query.sort.unwrap_or(DocumentSort::Number);
    let descending = query.order.map_or_else(
        || sort.descending_by_default(),
        |order| order == Order::Desc,
    );
    let direction = if descending { "DESC" } else { "ASC" };
    qb.push(" ORDER BY ");
    match sort {
        DocumentSort::Number => qb.push("d.number ").push(direction).push(", d.key ASC"),
        DocumentSort::Key => qb.push("d.key ").push(direction),
        DocumentSort::Title => qb.push("d.title ").push(direction).push(", d.key ASC"),
        DocumentSort::Kind => qb.push("d.kind ").push(direction).push(", d.key ASC"),
        DocumentSort::Status => qb
            .push("CASE d.status WHEN 'draft' THEN 0 WHEN 'accepted' THEN 1 WHEN 'superseded' THEN 2 WHEN 'archived' THEN 3 ELSE 99 END ")
            .push(direction)
            .push(", d.key ASC"),
        DocumentSort::CreatedAt => qb.push("d.created_at ").push(direction).push(", d.key ASC"),
        DocumentSort::UpdatedAt => qb.push("d.updated_at ").push(direction).push(", d.key ASC"),
        DocumentSort::ClosedAt => qb
            .push("(d.closed_at IS NULL) ASC, d.closed_at ")
            .push(direction)
            .push(", d.key ASC"),
    };
}

pub async fn query_documents(
    db: &Db,
    plan_id: Option<&str>,
    query: &DocumentQuery,
) -> Result<DocumentList> {
    let (limit, offset) = query.pagination()?;
    let fields = parse_document_fields(query.fields.as_ref());
    let include_body = query.include_body == Some(true)
        || fields
            .as_ref()
            .is_some_and(|fields| fields.iter().any(|field| field == "body"));

    let mut count = QueryBuilder::new("SELECT COUNT(*) FROM documents d");
    if plan_id.is_some() {
        count.push(" JOIN plan_documents pd ON pd.document_id = d.id");
    }
    push_document_where(&mut count, plan_id, query);
    let total: i64 = count.build_query_scalar().fetch_one(db.pool()).await?;

    let mut select = QueryBuilder::new("SELECT d.* FROM documents d");
    if plan_id.is_some() {
        select.push(" JOIN plan_documents pd ON pd.document_id = d.id");
    }
    push_document_where(&mut select, plan_id, query);
    push_document_order(&mut select, query);
    select
        .push(" LIMIT ")
        .push_bind(limit.get())
        .push(" OFFSET ")
        .push_bind(offset.get());
    let rows: Vec<Document> = select.build_query_as().fetch_all(db.pool()).await?;

    let items = rows
        .into_iter()
        .map(|document| {
            let mut view = DocumentView::from(document);
            if include_body {
                view.short_body = None;
            } else {
                let preview = short_body(view.body.as_deref().unwrap_or_default());
                view.body = None;
                view.short_body = Some(preview);
            }
            Ok(pick_document_fields(view, fields.as_deref()))
        })
        .collect::<Result<Vec<_>>>()?;

    Ok(DocumentList { items, total })
}

async fn allocate_number_tx(tx: &mut Tx, project_id: &str) -> Result<i64> {
    let (high, used): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE((SELECT last_number FROM document_number_high_water WHERE project_id = ?), 0),
                COALESCE((SELECT MAX(number) FROM documents WHERE project_id = ?), 0)",
    )
    .bind(project_id)
    .bind(project_id)
    .fetch_one(&mut **tx)
    .await?;
    let next = high.max(used) + 1;
    sqlx::query(
        "INSERT INTO document_number_high_water (project_id, last_number) VALUES (?, ?)
         ON CONFLICT (project_id) DO UPDATE SET last_number = excluded.last_number",
    )
    .bind(project_id)
    .bind(next)
    .execute(&mut **tx)
    .await?;
    Ok(next)
}

pub async fn create_document(
    db: &Db,
    project_id: &str,
    kind: DocumentKind,
    title: &str,
    body: &str,
    source_file: Option<&str>,
) -> Result<Document> {
    let project = crate::projects::get_project(db, project_id)
        .await?
        .ok_or_else(|| AppError::not_found(format!("project {project_id} not found")))?;
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::validation("document title is required"));
    }
    let id = uuid::Uuid::new_v4().to_string();
    let now = crate::tasks::now_iso();
    let mut tx = db.begin().await?;
    let number = allocate_number_tx(&mut tx, project_id).await?;
    let key = format!("{}-{number}", project.prefix.as_str());
    sqlx::query(
        "INSERT INTO documents (id, project_id, number, key, kind, title, body, status,
                                source_file, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)",
    )
    .bind(&id)
    .bind(project_id)
    .bind(number)
    .bind(&key)
    .bind(kind.as_str())
    .bind(title)
    .bind(body.trim())
    .bind(source_file)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    require_document(db, &id).await
}

pub async fn update_document(
    db: &Db,
    id: &str,
    patch: &DocumentPatch,
    expected_updated_at: Option<&str>,
) -> Result<Document> {
    let id = resolve_document_id(db, id).await?;
    let mut tx = db.begin().await?;
    let current = fetch_by_id::<Document, _>(
        sqlx::query("SELECT * FROM documents WHERE id = ?").bind(&id),
        &mut *tx,
    )
    .await?
    .ok_or_else(|| AppError::not_found(format!("document {id} not found")))?;
    if current.deleted_at.is_some() {
        return Err(AppError::not_found(format!("document {id} not found")));
    }
    if let Some(expected) = expected_updated_at
        && expected != current.updated_at
    {
        return Err(AppError::conflict(format!(
            "document {id} changed since {expected}"
        )));
    }

    let title = match &patch.title {
        Some(raw) => {
            let title = raw.trim();
            if title.is_empty() {
                return Err(AppError::validation("document title is required"));
            }
            title.to_string()
        }
        None => current.title.clone(),
    };
    let body = patch
        .body
        .as_deref()
        .map(str::trim)
        .unwrap_or(&current.body)
        .to_string();
    let kind = patch.kind.unwrap_or(current.kind);
    let status = patch.status.unwrap_or(current.status);
    let source_file = match &patch.source_file {
        Some(value) => value.clone(),
        None => current.source_file.clone(),
    };
    let now = crate::tasks::now_iso();
    let closed_at = match status {
        DocumentStatus::Draft => None,
        _ => Some(current.closed_at.unwrap_or_else(|| now.clone())),
    };

    if body != current.body {
        sqlx::query(
            "INSERT INTO text_revisions (entity, entity_id, field, body, created_at)
             VALUES ('document', ?, 'body', ?, ?)",
        )
        .bind(&id)
        .bind(&current.body)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(
        "UPDATE documents SET kind = ?, title = ?, body = ?, status = ?, source_file = ?,
                              closed_at = ?, updated_at = ?
         WHERE id = ?",
    )
    .bind(kind.as_str())
    .bind(title)
    .bind(&body)
    .bind(status.as_str())
    .bind(source_file)
    .bind(closed_at)
    .bind(&now)
    .bind(&id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    require_document(db, &id).await
}

pub async fn delete_document(db: &Db, id: &str) -> Result<Document> {
    let current = require_document(db, id).await?;
    if current.deleted_at.is_some() {
        return Ok(current);
    }
    let id = current.id;
    let now = crate::tasks::now_iso();
    sqlx::query("UPDATE documents SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&now)
        .bind(&id)
        .execute(db.pool())
        .await?;
    require_document(db, &id).await
}

pub async fn restore_document(db: &Db, id: &str) -> Result<Document> {
    let current = require_document(db, id).await?;
    if current.deleted_at.is_none() {
        return Ok(current);
    }
    let id = current.id;
    sqlx::query("UPDATE documents SET deleted_at = NULL WHERE id = ?")
        .bind(&id)
        .execute(db.pool())
        .await?;
    require_document(db, &id).await
}

pub async fn list_document_revisions(db: &Db, id: &str) -> Result<Vec<TextRevision>> {
    let document = require_document(db, id).await?;
    let rows = sqlx::query(
        "SELECT id, entity, entity_id, field, body, created_at FROM text_revisions
         WHERE entity = 'document' AND entity_id = ? ORDER BY id DESC",
    )
    .bind(&document.id)
    .fetch_all(db.pool())
    .await?;
    rows.iter()
        .map(|row| {
            Ok(TextRevision {
                id: row.get("id"),
                entity: row.get("entity"),
                entity_id: row.get("entity_id"),
                field: row.get("field"),
                body: row.get("body"),
                created_at: row.get("created_at"),
            })
        })
        .collect()
}

pub async fn link_document_to_plan(db: &Db, plan_id: &str, document_id: &str) -> Result<()> {
    crate::require_plan(db, plan_id).await?;
    let document = require_document(db, document_id).await?;
    sqlx::query("INSERT OR IGNORE INTO plan_documents (plan_id, document_id) VALUES (?, ?)")
        .bind(plan_id)
        .bind(&document.id)
        .execute(db.pool())
        .await?;
    Ok(())
}

pub async fn unlink_document_from_plan(db: &Db, plan_id: &str, document_id: &str) -> Result<()> {
    let document = require_document(db, document_id).await?;
    sqlx::query("DELETE FROM plan_documents WHERE plan_id = ? AND document_id = ?")
        .bind(plan_id)
        .bind(&document.id)
        .execute(db.pool())
        .await?;
    Ok(())
}

pub async fn documents_for_plan(db: &Db, plan_id: &str) -> Result<Vec<Document>> {
    let rows = sqlx::query_as::<_, Document>(
        "SELECT d.* FROM plan_documents pd
         JOIN documents d ON d.id = pd.document_id
         WHERE pd.plan_id = ? AND d.deleted_at IS NULL
         ORDER BY d.project_id, d.number",
    )
    .bind(plan_id)
    .fetch_all(db.pool())
    .await?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn open() -> Db {
        let db = Db::open(":memory:").await.expect("open");
        db.migrate().await.expect("migrate");
        for (id, prefix, name) in [("log", "LOG", "Log"), ("spa", "SPA", "Space")] {
            sqlx::query(
                "INSERT INTO projects (id, prefix, name, created_at) VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z')",
            )
            .bind(id)
            .bind(prefix)
            .bind(name)
            .execute(db.pool())
            .await
            .expect("project");
        }
        db
    }

    #[test]
    fn kinds_and_statuses_round_trip() {
        for kind in DocumentKind::ALL {
            assert_eq!(DocumentKind::from_db(kind.as_str()), Some(kind));
        }
        for status in DocumentStatus::ALL {
            assert_eq!(DocumentStatus::from_db(status.as_str()), Some(status));
        }
        assert_eq!(DocumentKind::from_db("open"), None);
        assert_eq!(DocumentStatus::from_db("open"), None);
    }

    #[tokio::test]
    async fn creates_updates_and_soft_deletes_a_document() {
        let db = open().await;
        let doc = create_document(
            &db,
            "log",
            DocumentKind::Adr,
            "  Decision  ",
            " first ",
            Some("docs/adr/0001.md"),
        )
        .await
        .expect("create");
        assert_eq!(doc.key, "LOG-1");
        assert_eq!(doc.title, "Decision");
        assert_eq!(doc.body, "first");
        assert_eq!(doc.status, DocumentStatus::Draft);
        assert_eq!(doc.source_file.as_deref(), Some("docs/adr/0001.md"));

        let updated = update_document(
            &db,
            &doc.id,
            &DocumentPatch {
                body: Some(" second ".into()),
                status: Some(DocumentStatus::Accepted),
                ..DocumentPatch::default()
            },
            Some(&doc.updated_at),
        )
        .await
        .expect("update");
        assert_eq!(updated.key, "LOG-1");
        assert_eq!(updated.body, "second");
        assert_eq!(updated.status, DocumentStatus::Accepted);
        assert!(updated.closed_at.is_some());

        let revisions = list_document_revisions(&db, &doc.id)
            .await
            .expect("revisions");
        assert_eq!(revisions.len(), 1);
        assert_eq!(revisions[0].body, "first");
        assert_eq!(revisions[0].field, "body");

        let stale = update_document(
            &db,
            &doc.id,
            &DocumentPatch::default(),
            Some(&doc.updated_at),
        )
        .await
        .expect_err("stale update");
        assert_eq!(stale.kind(), crate::AppErrorKind::Conflict);

        delete_document(&db, &doc.id).await.expect("delete");
        assert!(
            list_documents(&db, Some("log"))
                .await
                .expect("list")
                .is_empty()
        );
        assert_eq!(list_deleted_documents(&db).await.expect("deleted").len(), 1);

        restore_document(&db, &doc.id).await.expect("restore");
        assert_eq!(
            list_documents(&db, Some("log")).await.expect("list").len(),
            1
        );
    }

    #[tokio::test]
    async fn a_failed_document_update_leaves_no_revision() {
        let db = open().await;
        let doc = create_document(&db, "log", DocumentKind::Adr, "Decision", "first", None)
            .await
            .expect("create");
        sqlx::query(
            "CREATE TRIGGER reject_document_update BEFORE UPDATE OF title ON documents
             WHEN NEW.title = 'reject'
             BEGIN SELECT RAISE(ABORT, 'reject'); END",
        )
        .execute(db.pool())
        .await
        .expect("trigger");

        let failed = update_document(
            &db,
            &doc.key,
            &DocumentPatch {
                title: Some("reject".into()),
                body: Some("second".into()),
                ..DocumentPatch::default()
            },
            None,
        )
        .await
        .expect_err("update rejected by trigger");
        assert_eq!(failed.kind(), crate::AppErrorKind::Unexpected);
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM text_revisions WHERE entity = 'document' AND entity_id = ?"
            )
            .bind(&doc.id)
            .fetch_one(db.pool())
            .await
            .expect("revision count"),
            0
        );
        assert_eq!(
            get_document(&db, &doc.id)
                .await
                .expect("get")
                .expect("document")
                .body,
            "first"
        );

        sqlx::query("DROP TRIGGER reject_document_update")
            .execute(db.pool())
            .await
            .expect("drop trigger");
        let updated = update_document(
            &db,
            &doc.key,
            &DocumentPatch {
                body: Some("second".into()),
                ..DocumentPatch::default()
            },
            None,
        )
        .await
        .expect("update");
        assert_eq!(updated.body, "second");
        assert_eq!(
            list_document_revisions(&db, &doc.id)
                .await
                .expect("revisions")
                .len(),
            1
        );
    }

    #[tokio::test]
    async fn documents_are_project_scoped_and_link_to_plans() {
        let db = open().await;
        let log = create_document(&db, "log", DocumentKind::Prd, "PRD", "", None)
            .await
            .expect("log document");
        let spa = create_document(&db, "spa", DocumentKind::Spec, "Spec", "", None)
            .await
            .expect("spa document");
        assert_eq!(log.key, "LOG-1");
        assert_eq!(spa.key, "SPA-1");
        assert_eq!(list_documents(&db, None).await.expect("all").len(), 2);
        assert_eq!(
            list_documents(&db, Some("spa")).await.expect("spa").len(),
            1
        );

        let plan = crate::create_plan(&db, "Docs", "", crate::PlanStatus::Active)
            .await
            .expect("plan");
        link_document_to_plan(&db, &plan.id, &spa.id)
            .await
            .expect("cross-project link");
        let linked = documents_for_plan(&db, &plan.id).await.expect("linked");
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].id, spa.id);

        unlink_document_from_plan(&db, &plan.id, &spa.id)
            .await
            .expect("unlink");
        assert!(
            documents_for_plan(&db, &plan.id)
                .await
                .expect("linked")
                .is_empty()
        );

        delete_document(&db, &spa.id).await.expect("delete");
        let next = create_document(&db, "spa", DocumentKind::Guide, "Guide", "", None)
            .await
            .expect("next");
        assert_eq!(next.key, "SPA-2");
    }

    #[tokio::test]
    async fn document_keys_are_accepted_everywhere() {
        let db = open().await;
        let log = create_document(&db, "log", DocumentKind::Adr, "ADR", "first", None)
            .await
            .expect("log document");
        let spa = create_document(&db, "spa", DocumentKind::Spec, "Spec", "", None)
            .await
            .expect("spa document");

        assert_eq!(
            require_document(&db, "LOG-1").await.expect("key").id,
            log.id
        );
        assert_eq!(
            require_document(&db, " log-1 ").await.expect("trimmed").id,
            log.id
        );
        assert_eq!(
            require_document(&db, &log.id).await.expect("uuid").id,
            log.id
        );
        assert_eq!(
            require_document(&db, "1")
                .await
                .expect_err("bare number")
                .kind(),
            crate::AppErrorKind::Validation
        );
        assert_eq!(
            require_document(&db, "LOG-9")
                .await
                .expect_err("unknown key")
                .kind(),
            crate::AppErrorKind::NotFound
        );

        let updated = update_document(
            &db,
            "LOG-1",
            &DocumentPatch {
                body: Some("second".into()),
                ..DocumentPatch::default()
            },
            None,
        )
        .await
        .expect("update by key");
        assert_eq!(updated.body, "second");
        let revisions = list_document_revisions(&db, "LOG-1")
            .await
            .expect("revisions");
        assert_eq!(revisions.len(), 1);
        assert_eq!(revisions[0].entity_id, log.id);
        assert_eq!(revisions[0].body, "first");

        let plan = crate::create_plan(&db, "Docs", "", crate::PlanStatus::Active)
            .await
            .expect("plan");
        link_document_to_plan(&db, &plan.id, "SPA-1")
            .await
            .expect("link by key");
        assert_eq!(
            documents_for_plan(&db, &plan.id)
                .await
                .expect("linked")
                .len(),
            1
        );
        unlink_document_from_plan(&db, &plan.id, "spa-1")
            .await
            .expect("unlink by key");
        assert!(
            documents_for_plan(&db, &plan.id)
                .await
                .expect("linked")
                .is_empty()
        );

        delete_document(&db, "LOG-1").await.expect("delete by key");
        assert!(
            list_documents(&db, Some("log"))
                .await
                .expect("list")
                .is_empty()
        );
        restore_document(&db, "LOG-1")
            .await
            .expect("restore by key");
        assert_eq!(
            list_documents(&db, Some("log")).await.expect("list").len(),
            1
        );

        delete_document(&db, &log.id).await.expect("delete again");
        let next = create_document(&db, "log", DocumentKind::Guide, "Guide", "", None)
            .await
            .expect("next");
        assert_eq!(next.key, "LOG-2");
        let _ = &spa;
    }

    #[tokio::test]
    async fn document_query_paginates_previews_and_filters_deleted() {
        let db = open().await;
        let first = create_document(
            &db,
            "log",
            DocumentKind::Adr,
            "First",
            "intro\nsecond line",
            None,
        )
        .await
        .expect("first");
        let second = create_document(&db, "spa", DocumentKind::Spec, "Second", "other", None)
            .await
            .expect("second");
        let plan = crate::create_plan(&db, "Docs", "", crate::PlanStatus::Active)
            .await
            .expect("plan");
        link_document_to_plan(&db, &plan.id, &second.id)
            .await
            .expect("link");

        let default = query_documents(&db, None, &DocumentQuery::default())
            .await
            .expect("query");
        assert_eq!(default.total, 2);
        assert_eq!(default.items.len(), 2);
        let json = serde_json::to_value(&default.items[0]).unwrap();
        assert_eq!(json["id"], first.id);
        assert_eq!(json["key"], "LOG-1");
        assert_eq!(json["kind"], "adr");
        assert_eq!(json["short_body"], "intro");
        assert!(json.get("body").is_none());

        let full = query_documents(
            &db,
            None,
            &DocumentQuery {
                include_body: Some(true),
                fields: Some(FieldSelection::Csv("id,body".into())),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("full query");
        let json = serde_json::to_value(&full.items[0]).unwrap();
        assert_eq!(json["body"], "intro\nsecond line");
        assert!(json.get("short_body").is_none());
        assert!(json.get("title").is_none());
        assert_eq!(json["id"], first.id);

        let paged = query_documents(
            &db,
            None,
            &DocumentQuery {
                limit: 1,
                offset: 1,
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("paged query");
        assert_eq!(paged.total, 2);
        assert_eq!(paged.items.len(), 1);
        assert_eq!(
            serde_json::to_value(&paged.items[0]).unwrap()["key"],
            "SPA-1"
        );

        let linked = query_documents(&db, Some(&plan.id), &DocumentQuery::default())
            .await
            .expect("linked query");
        assert_eq!(linked.total, 1);
        assert_eq!(
            serde_json::to_value(&linked.items[0]).unwrap()["id"],
            second.id
        );

        delete_document(&db, &second.id).await.expect("delete");
        assert_eq!(
            query_documents(&db, None, &DocumentQuery::default())
                .await
                .expect("hidden")
                .total,
            1
        );
        let with_deleted = query_documents(
            &db,
            None,
            &DocumentQuery {
                include_deleted: Some(true),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("with deleted");
        assert_eq!(with_deleted.total, 2);
        let values = serde_json::to_value(&with_deleted.items).unwrap();
        assert!(
            values
                .as_array()
                .unwrap()
                .iter()
                .any(|item| item["id"] == second.id && item["deleted_at"].is_string())
        );

        let invalid = query_documents(
            &db,
            None,
            &DocumentQuery {
                limit: 0,
                ..DocumentQuery::default()
            },
        )
        .await
        .expect_err("invalid limit");
        assert_eq!(invalid.kind(), crate::AppErrorKind::Validation);
    }

    #[tokio::test]
    async fn document_query_filters_sorts_and_scopes_projects() {
        let db = open().await;
        let alpha = create_document(
            &db,
            "log",
            DocumentKind::Adr,
            "Alpha",
            "alpha body",
            Some("docs/alpha.md"),
        )
        .await
        .expect("alpha");
        let beta = create_document(
            &db,
            "log",
            DocumentKind::Spec,
            "Beta",
            "beta body",
            Some("docs/beta.md"),
        )
        .await
        .expect("beta");
        let gamma = create_document(&db, "spa", DocumentKind::Guide, "Gamma", "gamma", None)
            .await
            .expect("gamma");
        update_document(
            &db,
            &gamma.id,
            &DocumentPatch {
                status: Some(DocumentStatus::Accepted),
                ..DocumentPatch::default()
            },
            None,
        )
        .await
        .expect("accepted");

        let kinds = query_documents(
            &db,
            None,
            &DocumentQuery {
                kind: Some(OneOrList::Many(vec![
                    DocumentKind::Adr,
                    DocumentKind::Guide,
                ])),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("kinds");
        assert_eq!(kinds.total, 2);
        let values = serde_json::to_value(&kinds.items).unwrap();
        assert!(
            values
                .as_array()
                .unwrap()
                .iter()
                .any(|item| item["id"] == alpha.id)
        );
        assert!(
            values
                .as_array()
                .unwrap()
                .iter()
                .any(|item| item["id"] == gamma.id)
        );

        let statuses = query_documents(
            &db,
            None,
            &DocumentQuery {
                status: Some(OneOrList::One(DocumentStatus::Accepted)),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("statuses");
        assert_eq!(statuses.total, 1);
        assert_eq!(
            serde_json::to_value(&statuses.items[0]).unwrap()["id"],
            gamma.id
        );

        let searched = query_documents(
            &db,
            None,
            &DocumentQuery {
                q: Some("DOCS/BETA".into()),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("search");
        assert_eq!(
            serde_json::to_value(&searched.items[0]).unwrap()["id"],
            beta.id
        );
        let body_not_searched = query_documents(
            &db,
            None,
            &DocumentQuery {
                q: Some("body".into()),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("body search");
        assert_eq!(body_not_searched.total, 0);

        let titled = query_documents(
            &db,
            None,
            &DocumentQuery {
                title: Some("alp".into()),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("title");
        assert_eq!(
            serde_json::to_value(&titled.items[0]).unwrap()["id"],
            alpha.id
        );
        let exact = query_documents(
            &db,
            None,
            &DocumentQuery {
                title_exact: Some("BETA".into()),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("exact title");
        assert_eq!(
            serde_json::to_value(&exact.items[0]).unwrap()["id"],
            beta.id
        );
        let sources = query_documents(
            &db,
            None,
            &DocumentQuery {
                source_file: Some("ALPHA".into()),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("source");
        assert_eq!(
            serde_json::to_value(&sources.items[0]).unwrap()["id"],
            alpha.id
        );

        let projects = query_documents(
            &db,
            None,
            &DocumentQuery {
                project_id: Some(OneOrList::One(ProjectId::new("log"))),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("one project");
        assert_eq!(projects.total, 2);
        let projects = query_documents(
            &db,
            None,
            &DocumentQuery {
                project_id: Some(OneOrList::Many(vec![
                    ProjectId::new("log"),
                    ProjectId::new("spa"),
                ])),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("many projects");
        assert_eq!(projects.total, 3);

        let sorted = query_documents(
            &db,
            None,
            &DocumentQuery {
                sort: Some(DocumentSort::Title),
                order: Some(crate::query::Order::Desc),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("sorted");
        let keys: Vec<String> = serde_json::to_value(&sorted.items)
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["key"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(keys, vec!["SPA-1", "LOG-2", "LOG-1"]);

        delete_document(&db, &beta.id).await.expect("delete");
        let only_deleted = query_documents(
            &db,
            None,
            &DocumentQuery {
                deleted_only: Some(true),
                include_deleted: Some(false),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("deleted only");
        assert_eq!(only_deleted.total, 1);
        assert_eq!(
            serde_json::to_value(&only_deleted.items[0]).unwrap()["id"],
            beta.id
        );
    }
}
