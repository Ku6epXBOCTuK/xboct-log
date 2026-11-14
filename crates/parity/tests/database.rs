use std::{fs, path::PathBuf, time::SystemTime};

use serde_json::Value;
use xboct_log_parity::{diff::difference, snapshot::read_database};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn modified_ms(path: &PathBuf) -> i64 {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_else(now_ms)
}

fn newest_timestamp(text: &str) -> Option<i64> {
    let regex = regex::Regex::new(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z").unwrap();
    regex
        .find_iter(text)
        .filter_map(|found| chrono::DateTime::parse_from_rfc3339(found.as_str()).ok())
        .map(|stamp| stamp.timestamp_millis())
        .max()
}

#[tokio::test]
async fn reads_the_node_database_like_the_committed_fixture() {
    let root = root();
    let database = root.join("tests/parity/.tmp/runtime/seed.sqlite");
    if !database.exists() {
        eprintln!(
            "skipping: {} is missing, run pnpm parity:seed",
            database.display()
        );
        return;
    }

    let fixture_path = root.join("tests/parity/fixtures/db.json");
    let fixture = fs::read_to_string(&fixture_path).expect("tests/parity/fixtures/db.json");
    let expected: Value = serde_json::from_str(&fixture).expect("the fixture is json");
    let now = newest_timestamp(&fixture).unwrap_or_else(|| modified_ms(&fixture_path));

    let document = read_database(&database, now).await.unwrap();
    let actual = serde_json::to_value(&document).unwrap();

    if let Some(found) = difference(&expected, &actual) {
        panic!("the rust snapshot differs from the fixture: {found}");
    }
}
