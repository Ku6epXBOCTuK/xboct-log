use super::*;

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
    assert_eq!(doc.key, "LOG-DOC-1");
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
    assert_eq!(updated.key, "LOG-DOC-1");
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
    assert_eq!(log.key, "LOG-DOC-1");
    assert_eq!(spa.key, "SPA-DOC-1");
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
    assert_eq!(next.key, "SPA-DOC-2");
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
        require_document(&db, "LOG-DOC-1").await.expect("key").id,
        log.id
    );
    assert_eq!(
        require_document(&db, " log-doc-1 ")
            .await
            .expect("trimmed")
            .id,
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
        require_document(&db, "LOG-DOC-9")
            .await
            .expect_err("unknown key")
            .kind(),
        crate::AppErrorKind::NotFound
    );

    let updated = update_document(
        &db,
        "LOG-DOC-1",
        &DocumentPatch {
            body: Some("second".into()),
            ..DocumentPatch::default()
        },
        None,
    )
    .await
    .expect("update by key");
    assert_eq!(updated.body, "second");
    let revisions = list_document_revisions(&db, "LOG-DOC-1")
        .await
        .expect("revisions");
    assert_eq!(revisions.len(), 1);
    assert_eq!(revisions[0].entity_id, log.id);
    assert_eq!(revisions[0].body, "first");

    let plan = crate::create_plan(&db, "Docs", "", crate::PlanStatus::Active)
        .await
        .expect("plan");
    link_document_to_plan(&db, &plan.id, "SPA-DOC-1")
        .await
        .expect("link by key");
    assert_eq!(
        documents_for_plan(&db, &plan.id)
            .await
            .expect("linked")
            .len(),
        1
    );
    unlink_document_from_plan(&db, &plan.id, "spa-doc-1")
        .await
        .expect("unlink by key");
    assert!(
        documents_for_plan(&db, &plan.id)
            .await
            .expect("linked")
            .is_empty()
    );

    delete_document(&db, "LOG-DOC-1")
        .await
        .expect("delete by key");
    assert!(
        list_documents(&db, Some("log"))
            .await
            .expect("list")
            .is_empty()
    );
    restore_document(&db, "LOG-DOC-1")
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
    assert_eq!(next.key, "LOG-DOC-2");
    let _ = &spa;
}
