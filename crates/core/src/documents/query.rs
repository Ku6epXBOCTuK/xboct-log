use super::*;

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
        push_in_text(qb, "d.project_id COLLATE NOCASE", &values);
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
        qb.push(" AND (");
        push_like(qb, "ULOWER(d.title)", term);
        qb.push(" OR ");
        push_like(qb, "ULOWER(d.key)", term);
        qb.push(" OR ");
        push_like(qb, "ULOWER(COALESCE(d.source_file, ''))", term);
        qb.push(")");
    }
    if let Some(title) = &query.title {
        qb.push(" AND ");
        push_like(qb, "ULOWER(d.title)", title);
    }
    if let Some(title) = &query.title_exact {
        qb.push(" AND ULOWER(d.title) = ")
            .push_bind(title.to_lowercase());
    }
    if let Some(source) = &query.source_file {
        qb.push(" AND ");
        push_like(qb, "ULOWER(COALESCE(d.source_file, ''))", source);
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
    let resolved_plan = match plan_id {
        Some(raw) => Some(resolve_plan_id(db.pool(), raw).await?),
        None => None,
    };
    let plan_id = resolved_plan.as_deref();
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
    let id = DocumentId::new();
    let now = crate::common::now_iso();
    let mut tx = db.begin().await?;
    let number = allocate_number_tx(&mut tx, project.id.as_str()).await?;
    let key = format!(
        "{}-{}-{}",
        project.prefix.as_str(),
        DocumentKey::MARKER,
        number
    );
    sqlx::query(
        "INSERT INTO documents (id, project_id, number, key, kind, title, body, status,
                                source_file, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)",
    )
    .bind(id.as_str())
    .bind(project.id.as_str())
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
    require_document(db, id.as_str()).await
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
    let now = crate::common::now_iso();
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
    let now = crate::common::now_iso();
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
    let plan_id = resolve_plan_id(db.pool(), plan_id).await?;
    crate::require_plan(db, &plan_id).await?;
    let document = require_document(db, document_id).await?;
    sqlx::query("INSERT OR IGNORE INTO plan_documents (plan_id, document_id) VALUES (?, ?)")
        .bind(&plan_id)
        .bind(&document.id)
        .execute(db.pool())
        .await?;
    Ok(())
}

pub async fn unlink_document_from_plan(db: &Db, plan_id: &str, document_id: &str) -> Result<()> {
    let plan_id = resolve_plan_id(db.pool(), plan_id).await?;
    let document = require_document(db, document_id).await?;
    sqlx::query("DELETE FROM plan_documents WHERE plan_id = ? AND document_id = ?")
        .bind(&plan_id)
        .bind(&document.id)
        .execute(db.pool())
        .await?;
    Ok(())
}

pub async fn documents_for_plan(db: &Db, plan_id: &str) -> Result<Vec<Document>> {
    let plan_id = resolve_plan_id(db.pool(), plan_id).await?;
    let rows = sqlx::query_as::<_, Document>(
        "SELECT d.* FROM plan_documents pd
         JOIN documents d ON d.id = pd.document_id
         WHERE pd.plan_id = ? AND d.deleted_at IS NULL
         ORDER BY d.project_id, d.number",
    )
    .bind(&plan_id)
    .fetch_all(db.pool())
    .await?;
    Ok(rows)
}
