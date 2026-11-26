use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Instance {
    pub pid: u32,
    pub port: u16,
    pub url: String,
    pub version: String,
}

impl Instance {
    pub fn write(&self, path: &Path) -> std::io::Result<()> {
        let text = serde_json::to_string_pretty(self).map_err(std::io::Error::other)?;
        std::fs::write(path, text)
    }

    pub fn read(path: &Path) -> Option<Self> {
        let text = std::fs::read_to_string(path).ok()?;
        serde_json::from_str(&text).ok()
    }

    pub fn remove(path: &Path) {
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_the_file() {
        let dir = xboct_log_test_support::scratch_dir("instance");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("instance.json");
        let instance = Instance {
            pid: 42,
            port: 45881,
            url: "http://127.0.0.1:45881/".to_string(),
            version: "0.9.0".to_string(),
        };

        instance.write(&path).unwrap();
        assert_eq!(Instance::read(&path), Some(instance));

        Instance::remove(&path);
        assert_eq!(Instance::read(&path), None);
        Instance::remove(&path);

        let _ = std::fs::remove_dir_all(dir);
    }
}
