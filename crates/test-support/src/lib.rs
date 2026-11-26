use std::path::PathBuf;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static RUN: OnceLock<u128> = OnceLock::new();
static NEXT: AtomicU64 = AtomicU64::new(0);

pub fn scratch_dir(prefix: &str) -> PathBuf {
    let run = *RUN.get_or_init(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is after the Unix epoch")
            .as_nanos()
    });
    let dir = std::env::temp_dir().join(format!(
        "xboct-log-{prefix}-{}-{run}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    if dir.exists() {
        std::fs::remove_dir_all(&dir).expect("remove stale scratch directory");
    }
    std::fs::create_dir_all(&dir).expect("create scratch directory");
    dir
}
