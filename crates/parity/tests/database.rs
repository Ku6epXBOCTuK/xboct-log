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

#[tokio::test]
async fn reads_the_node_database_like_the_committed_fixture() {
    let root = root();
    let database = root.join("tests/parity/.tmp/runtime/db.sqlite");
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

    let document = read_database(&database, modified_ms(&fixture_path))
        .await
        .unwrap();
    let actual = serde_json::to_value(&document).unwrap();

    if let Some(found) = difference(&expected, &actual) {
        panic!("the rust snapshot differs from the fixture: {found}");
    }
}
