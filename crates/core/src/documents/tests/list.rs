use super::*;

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
    assert_eq!(json["key"], "LOG-DOC-1");
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
        "SPA-DOC-1"
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
    assert_eq!(keys, vec!["SPA-DOC-1", "LOG-DOC-2", "LOG-DOC-1"]);

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
