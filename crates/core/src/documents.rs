use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::{AppError, Db, DocumentKey, Result, Tx};

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct TextRevision {
    pub id: i64,
    pub entity: String,
    pub entity_id: String,
    pub field: String,
    pub body: String,
    pub created_at: String,
}

fn row_to_document(row: &sqlx::sqlite::SqliteRow) -> Result<Document> {
    let kind: String = row.get("kind");
    let status: String = row.get("status");
    Ok(Document {
        id: row.get("id"),
        project_id: row.get("project_id"),
        number: row.get("number"),
        key: row.get("key"),
        kind: DocumentKind::from_db(&kind).ok_or_else(|| {
            AppError::unexpected(format!(
                "document {} has unknown kind {kind}",
                row.get::<String, _>("id")
            ))
        })?,
        title: row.get("title"),
        body: row.get("body"),
        status: DocumentStatus::from_db(&status).ok_or_else(|| {
            AppError::unexpected(format!(
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

pub async fn get_document(db: &Db, id: &str) -> Result<Option<Document>> {
    let row = sqlx::query("SELECT * FROM documents WHERE id = ?")
        .bind(id)
        .fetch_optional(db.pool())
        .await?;
    row.as_ref().map(row_to_document).transpose()
}

pub async fn get_document_by_key(db: &Db, key: &str) -> Result<Option<Document>> {
    let row = sqlx::query("SELECT * FROM documents WHERE key = ?")
        .bind(key)
        .fetch_optional(db.pool())
        .await?;
    row.as_ref().map(row_to_document).transpose()
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
    let rows = match project_id {
        Some(id) => {
            sqlx::query(
                "SELECT * FROM documents WHERE deleted_at IS NULL AND project_id = ?
                 ORDER BY project_id, number",
            )
            .bind(id)
            .fetch_all(db.pool())
            .await?
        }
        None => {
            sqlx::query(
                "SELECT * FROM documents WHERE deleted_at IS NULL ORDER BY project_id, number",
            )
            .fetch_all(db.pool())
            .await?
        }
    };
    rows.iter().map(row_to_document).collect()
}

pub async fn list_deleted_documents(db: &Db) -> Result<Vec<Document>> {
    let rows = sqlx::query(
        "SELECT * FROM documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .fetch_all(db.pool())
    .await?;
    rows.iter().map(row_to_document).collect()
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
    let current = require_document(db, id).await?;
    let id = current.id.clone();
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
        .execute(db.pool())
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
    .execute(db.pool())
    .await?;
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
    let rows = sqlx::query(
        "SELECT d.* FROM plan_documents pd
         JOIN documents d ON d.id = pd.document_id
         WHERE pd.plan_id = ? AND d.deleted_at IS NULL
         ORDER BY d.project_id, d.number",
    )
    .bind(plan_id)
    .fetch_all(db.pool())
    .await?;
    rows.iter().map(row_to_document).collect()
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
}
