use std::path::{Path, PathBuf};

use axum::body::Body;
use axum::http::{Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};

pub async fn serve(dir: &Path, method: Method, uri: Uri) -> Response {
    if method != Method::GET && method != Method::HEAD {
        return (
            StatusCode::METHOD_NOT_ALLOWED,
            [(header::ALLOW, "GET, HEAD")],
        )
            .into_response();
    }

    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    if let Some(response) = file_response(dir, path, &method).await {
        return response;
    }
    if !path.contains('.')
        && let Some(response) = file_response(dir, "index.html", &method).await
    {
        return response;
    }
    StatusCode::NOT_FOUND.into_response()
}

async fn file_response(dir: &Path, path: &str, method: &Method) -> Option<Response> {
    let relative = safe_path(path)?;
    let data = tokio::fs::read(dir.join(relative)).await.ok()?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let headers = [
        (header::CONTENT_TYPE, mime.as_ref().to_owned()),
        (header::CACHE_CONTROL, cache_control(path)),
    ];
    let body = if *method == Method::HEAD {
        Body::empty()
    } else {
        Body::from(data)
    };
    Some((headers, body).into_response())
}

fn safe_path(path: &str) -> Option<PathBuf> {
    if path.contains('\\') {
        return None;
    }
    let mut safe = PathBuf::new();
    for segment in path.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return None;
        }
        safe.push(segment);
    }
    (!safe.as_os_str().is_empty()).then_some(safe)
}

fn cache_control(path: &str) -> String {
    if path.starts_with("_app/immutable/") {
        "public, max-age=31536000, immutable".to_owned()
    } else {
        "no-cache".to_owned()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use axum::body::to_bytes;

    use super::*;

    static NEXT_DIR: AtomicU64 = AtomicU64::new(0);

    fn web_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "xboct-log-static-{}-{}",
            std::process::id(),
            NEXT_DIR.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(dir.join("_app/immutable")).unwrap();
        std::fs::write(dir.join("index.html"), "<html>spa</html>").unwrap();
        std::fs::write(dir.join("_app/immutable/app.js"), "console.log(1)").unwrap();
        dir
    }

    async fn get(dir: &Path, path: &str) -> Response {
        let uri = path.parse().unwrap();
        serve(dir, Method::GET, uri).await
    }

    #[test]
    fn immutable_assets_are_cached_for_a_year() {
        assert_eq!(
            cache_control("_app/immutable/chunks/app.js"),
            "public, max-age=31536000, immutable"
        );
    }

    #[test]
    fn other_files_are_revalidated() {
        assert_eq!(cache_control("index.html"), "no-cache");
    }

    #[test]
    fn parent_segments_are_not_assets() {
        assert!(safe_path("../Cargo.toml").is_none());
        assert!(safe_path("_app/..\\Cargo.toml").is_none());
    }

    #[tokio::test]
    async fn serves_a_file_with_its_type_and_cache_header() {
        let dir = web_dir();
        let response = get(&dir, "/_app/immutable/app.js").await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_TYPE], "text/javascript");
        assert_eq!(
            response.headers()[header::CACHE_CONTROL],
            "public, max-age=31536000, immutable"
        );
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(&body[..], b"console.log(1)");
    }

    #[tokio::test]
    async fn every_page_falls_back_to_the_spa_shell() {
        let dir = web_dir();
        let response = get(&dir, "/tasks/LOG-1").await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        assert_eq!(&body[..], b"<html>spa</html>");
    }

    #[tokio::test]
    async fn a_missing_script_is_not_replaced_by_the_shell() {
        let dir = web_dir();
        assert_eq!(
            get(&dir, "/missing.js").await.status(),
            StatusCode::NOT_FOUND
        );
    }

    #[tokio::test]
    async fn only_reads_are_allowed() {
        let dir = web_dir();
        let response = serve(&dir, Method::POST, Uri::from_static("/")).await;
        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
    }
}
