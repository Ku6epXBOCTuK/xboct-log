use super::*;

#[tokio::test]
async fn document_search_treats_like_metacharacters_literally() {
    let db = open().await;
    let percent = create_document(
        &db,
        "log",
        DocumentKind::Adr,
        "100% done",
        "body",
        Some("docs/100%.md"),
    )
    .await
    .expect("percent document");
    let underscore = create_document(
        &db,
        "log",
        DocumentKind::Adr,
        "a_b done",
        "body",
        Some("docs/a_b.md"),
    )
    .await
    .expect("underscore document");
    create_document(&db, "log", DocumentKind::Adr, "100x done", "body", None)
        .await
        .expect("plain document");

    for (term, expected) in [
        ("100%", percent.id.as_str()),
        ("a_b", underscore.id.as_str()),
    ] {
        let found = query_documents(
            &db,
            None,
            &DocumentQuery {
                q: Some(term.into()),
                ..DocumentQuery::default()
            },
        )
        .await
        .expect("q search");
        assert_eq!(found.total, 1, "term {term}");
        assert_eq!(
            serde_json::to_value(&found.items[0]).unwrap()["id"],
            expected
        );
    }

    let titled = query_documents(
        &db,
        None,
        &DocumentQuery {
            title: Some("100%".into()),
            ..DocumentQuery::default()
        },
    )
    .await
    .expect("title search");
    assert_eq!(titled.total, 1);
    assert_eq!(
        serde_json::to_value(&titled.items[0]).unwrap()["id"],
        percent.id
    );

    let sources = query_documents(
        &db,
        None,
        &DocumentQuery {
            source_file: Some("a_b".into()),
            ..DocumentQuery::default()
        },
    )
    .await
    .expect("source search");
    assert_eq!(sources.total, 1);
    assert_eq!(
        serde_json::to_value(&sources.items[0]).unwrap()["id"],
        underscore.id
    );

    let plain = query_documents(
        &db,
        None,
        &DocumentQuery {
            q: Some("done".into()),
            ..DocumentQuery::default()
        },
    )
    .await
    .expect("plain search");
    assert_eq!(plain.total, 3);
}
