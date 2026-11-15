use std::{
    collections::BTreeMap,
    io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rmcp::transport::streamable_http_server::session::{
    SessionState, SessionStore, SessionStoreError,
};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

const FORMAT_VERSION: u32 = 1;
const KEEP_FOR: i64 = 30 * 24 * 60 * 60;

// NOTE: rmcp keeps sessions in memory, so an idle worker or a restart drops
// them and the client's stored session id gets 404 until it reconnects.
pub struct FileSessionStore {
    path: PathBuf,
    sessions: Mutex<BTreeMap<String, Entry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Entry {
    saved_at: i64,
    state: SessionState,
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionsFile {
    version: u32,
    sessions: BTreeMap<String, Entry>,
}

impl FileSessionStore {
    pub fn open(path: PathBuf) -> Self {
        let sessions = read(&path);
        Self {
            path,
            sessions: Mutex::new(sessions),
        }
    }

    async fn flush(&self, sessions: &BTreeMap<String, Entry>) -> Result<(), SessionStoreError> {
        let file = SessionsFile {
            version: FORMAT_VERSION,
            sessions: sessions.clone(),
        };
        let bytes = serde_json::to_vec(&file)?;
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || write_atomic(&path, &bytes)).await??;
        Ok(())
    }
}

#[async_trait::async_trait]
impl SessionStore for FileSessionStore {
    async fn load(&self, session_id: &str) -> Result<Option<SessionState>, SessionStoreError> {
        Ok(self
            .sessions
            .lock()
            .await
            .get(session_id)
            .map(|entry| entry.state.clone()))
    }

    async fn store(&self, session_id: &str, state: &SessionState) -> Result<(), SessionStoreError> {
        let mut sessions = self.sessions.lock().await;
        sessions.insert(
            session_id.to_owned(),
            Entry {
                saved_at: now(),
                state: state.clone(),
            },
        );
        self.flush(&sessions).await
    }

    async fn delete(&self, session_id: &str) -> Result<(), SessionStoreError> {
        let mut sessions = self.sessions.lock().await;
        if sessions.remove(session_id).is_none() {
            return Ok(());
        }
        self.flush(&sessions).await
    }
}

fn read(path: &Path) -> BTreeMap<String, Entry> {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let file = serde_json::from_str::<SessionsFile>(&text).unwrap_or(SessionsFile {
        version: FORMAT_VERSION,
        sessions: BTreeMap::new(),
    });
    if file.version != FORMAT_VERSION {
        return BTreeMap::new();
    }
    let cutoff = now() - KEEP_FOR;
    file.sessions
        .into_iter()
        .filter(|(_, entry)| entry.saved_at >= cutoff)
        .collect()
}

fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, bytes)?;
    std::fs::rename(&temp, path)
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs() as i64)
        .unwrap_or_default()
}
