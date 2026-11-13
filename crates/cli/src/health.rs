use std::time::Duration;

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

const TIMEOUT: Duration = Duration::from_millis(1500);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Health {
    pub data: Option<String>,
}

pub async fn check(port: u16) -> Option<Health> {
    tokio::time::timeout(TIMEOUT, probe(port))
        .await
        .ok()
        .flatten()
}

async fn probe(port: u16) -> Option<Health> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.ok()?;
    let request =
        format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    stream.write_all(request.as_bytes()).await.ok()?;
    let mut response = Vec::new();
    stream.read_to_end(&mut response).await.ok()?;
    parse(&response)
}

fn parse(response: &[u8]) -> Option<Health> {
    let split = response.windows(4).position(|part| part == b"\r\n\r\n")?;
    let head = &response[..split];
    let body = &response[split + 4..];

    let status = head.split(|byte| *byte == b'\n').next()?;
    let code = status.split(|byte| *byte == b' ').nth(1)?;
    if code != b"200" {
        return None;
    }

    let document: serde_json::Value = serde_json::from_slice(body).ok()?;
    if document.get("app")?.as_str()? != "xboct-log" {
        return None;
    }
    Some(Health {
        data: document
            .get("data")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response(status: &str, body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 {status}\r\ncontent-length: {}\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    #[test]
    fn reads_the_health_payload() {
        let health = parse(&response(
            "200 OK",
            r#"{"ok":true,"app":"xboct-log","version":"0.9.0","data":"abc"}"#,
        ))
        .unwrap();
        assert_eq!(health.data.as_deref(), Some("abc"));
    }

    #[test]
    fn accepts_a_health_without_a_fingerprint() {
        let health = parse(&response("200 OK", r#"{"ok":true,"app":"xboct-log"}"#)).unwrap();
        assert_eq!(health.data, None);
    }

    #[test]
    fn rejects_other_answers() {
        assert!(parse(&response("500 Oops", r#"{"app":"xboct-log"}"#)).is_none());
        assert!(parse(&response("200 OK", r#"{"app":"other"}"#)).is_none());
        assert!(parse(b"not http").is_none());
    }
}
