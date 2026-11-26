use super::*;

#[tokio::test]
async fn serves_the_live_attachment_bytes() {
    let app = test_app().await;
    app.add_attachment("ab12", "note.md", "ab12.md", false, Some(b"# hello"))
        .await;

    let (status, headers, body) = app.get("/media/ab12").await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, b"# hello");
    assert_eq!(header(&headers, "content-type"), "text/markdown");
    assert_eq!(
        header(&headers, "content-disposition"),
        "inline; filename=\"note.md\""
    );
    assert_eq!(header(&headers, "content-length"), "7");
    assert_eq!(header(&headers, "cache-control"), "no-store");
    assert_eq!(header(&headers, "x-content-type-options"), "nosniff");
    assert_eq!(
        header(&headers, "content-security-policy"),
        "default-src 'none'; sandbox"
    );

    app.stop().await;
}

#[tokio::test]
async fn hides_a_deleted_attachment_on_the_live_route() {
    let app = test_app().await;
    app.add_attachment("cd34", "old.txt", "cd34.txt", true, Some(b"old"))
        .await;

    let (status, headers, body) = app.get("/media/cd34").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(
        header(&headers, "content-type"),
        "text/plain; charset=utf-8"
    );
    assert_eq!(header(&headers, "x-content-type-options"), "nosniff");
    assert_eq!(body, b"no attachment with the id cd34");

    let (status, _, body) = app.get("/deleted/media/cd34").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, b"old");

    app.stop().await;
}

#[tokio::test]
async fn reports_a_file_missing_from_the_media_folder() {
    let app = test_app().await;
    app.add_attachment("ef56", "gone.txt", "ef56.txt", false, None)
        .await;

    let (status, _, body) = app.get("/media/ef56").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(
        body,
        b"the file gone.txt of the attachment ef56 is gone from the media folder"
    );

    let (status, _, body) = app.get("/media/ffff").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body, b"no attachment with the id ffff");

    app.stop().await;
}

#[tokio::test]
async fn marks_an_archive_as_an_attachment() {
    let app = test_app().await;
    app.add_attachment("aa11", "dump.zip", "aa11.zip", false, Some(b"PK"))
        .await;

    let (status, headers, _) = app.get("/media/aa11").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(header(&headers, "content-type"), "application/zip");
    assert_eq!(
        header(&headers, "content-disposition"),
        "attachment; filename=\"dump.zip\""
    );
    assert!(headers.get("content-security-policy").is_none());

    app.stop().await;
}
