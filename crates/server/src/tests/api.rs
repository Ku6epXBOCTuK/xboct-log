use super::*;

#[tokio::test]
async fn passes_the_operation_result_through_unchanged() {
    let response = ok_response(serde_json::json!([{"id": "a"}]));
    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let value: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value, serde_json::json!([{"id": "a"}]));

    let response = ok_response(serde_json::json!({"items": []}));
    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let value: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value, serde_json::json!({"items": []}));
}

#[tokio::test]
async fn health_reports_the_app_and_the_data_folder() {
    let app = test_app().await;
    let (status, headers, body) = app.get("/api/health").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(header(&headers, "content-type"), "application/json");
    assert_eq!(header(&headers, "cache-control"), "no-store");

    let value: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["ok"], true);
    assert_eq!(value["app"], "xboct-log");
    assert_eq!(value["version"], env!("CARGO_PKG_VERSION"));
    assert_eq!(
        value["data"],
        data_fingerprint(std::path::Path::new(&app.state.config.db_path))
    );

    app.stop().await;
}

#[tokio::test]
async fn backup_returns_the_snapshot_path_and_replaces_it() {
    let app = test_app().await;
    sqlx::query("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)")
        .execute(app.state.db.pool())
        .await
        .unwrap();
    sqlx::query("INSERT INTO notes (body) VALUES ('kept')")
        .execute(app.state.db.pool())
        .await
        .unwrap();

    let (status, headers, body) = app.post("/api/backup").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(header(&headers, "content-type"), "application/json");

    let value: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["ok"], true);
    let path = PathBuf::from(value["path"].as_str().unwrap());
    assert!(path.exists());

    let snapshot = Db::open(&path).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM notes")
        .fetch_one(snapshot.pool())
        .await
        .unwrap();
    assert_eq!(count, 1);
    snapshot.close().await;

    let (status, _, _) = app.post("/api/backup").await;
    assert_eq!(status, StatusCode::OK);

    app.stop().await;
}

#[tokio::test]
async fn serves_every_operation_over_rest() {
    let app = test_app().await;

    let (status, _, body) = app.post_json("/api/tags_dictionary", "", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, br#"{"items":[]}"#);

    let (status, _, body) = app
        .post_json("/api/tags_create", r#"{"name":"api"}"#, Some("tab-7"))
        .await;
    assert_eq!(status, StatusCode::OK);
    let created: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(created["name"], "api");
    assert_eq!(created["archived"], false);

    let (_, _, body) = app.post_json("/api/tags_dictionary", "", None).await;
    assert_eq!(body, br#"{"items":["api"]}"#);

    app.stop().await;
}

#[tokio::test]
async fn reports_operation_errors_as_json() {
    let app = test_app().await;

    let (status, headers, body) = app
        .post_json(
            "/api/tags_rename",
            r#"{"name":"nope","new_name":"x"}"#,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(header(&headers, "content-type"), "application/json");
    let error: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(error["kind"], "not_found");
    assert_eq!(error["message"], "tag nope not found");

    let (status, _, body) = app.post_json("/api/tasks_list", "not json", None).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let error: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(error["kind"], "validation");

    app.stop().await;
}

#[tokio::test]
async fn maps_a_terminated_session_error_to_not_found() {
    for body in [
        "Encounter an error when restore session: Session error: Session service terminated",
        "Encounter an error when get session: Session error: Session service terminated",
    ] {
        let response = Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Body::from(body))
            .unwrap();
        let response = normalize_mcp_response(response).await;

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(bytes, SESSION_EXPIRED_BODY);
    }
}

#[tokio::test]
async fn keeps_other_internal_errors_unchanged() {
    let response = Response::builder()
        .status(StatusCode::INTERNAL_SERVER_ERROR)
        .header(header::CONTENT_TYPE, "text/plain")
        .body(Body::from("boom"))
        .unwrap();
    let response = normalize_mcp_response(response).await;

    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(header(response.headers(), "content-type"), "text/plain");
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    assert_eq!(&bytes[..], b"boom");
}
