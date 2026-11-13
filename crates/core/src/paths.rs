use std::path::{Component, Path, PathBuf};

use sha2::{Digest, Sha256};

pub fn normalize_path(path: &Path) -> PathBuf {
    let absolute = std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf());
    let mut out = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            _ => out.push(component.as_os_str()),
        }
    }
    out
}

pub fn fingerprint_path(path: &Path) -> String {
    let mut text = normalize_path(path).to_string_lossy().replace('\\', "/");
    #[cfg(windows)]
    {
        text = text.to_lowercase();
    }
    let digest = Sha256::digest(text.as_bytes());
    let hex = format!("{digest:x}");
    hex.chars().take(16).collect()
}

pub fn data_fingerprint(db_path: &Path) -> String {
    let parent = db_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fingerprint_path(parent)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortens_the_path_hash_to_sixteen_hex_characters() {
        let fingerprint = fingerprint_path(Path::new("C:/data/tasks.db"));
        assert_eq!(fingerprint.len(), 16);
        assert!(
            fingerprint
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        );
    }

    #[test]
    fn ignores_case_on_windows() {
        #[cfg(windows)]
        assert_eq!(
            fingerprint_path(Path::new("C:/Data/Tasks")),
            fingerprint_path(Path::new("c:/data/tasks"))
        );
    }

    #[test]
    fn resolves_parent_segments() {
        assert_eq!(
            normalize_path(Path::new("C:/data/one/../two")),
            normalize_path(Path::new("C:/data/two"))
        );
    }

    #[test]
    fn hashes_the_database_directory() {
        let database = Path::new("C:/data/tasks.db");
        assert_eq!(
            data_fingerprint(database),
            fingerprint_path(Path::new("C:/data"))
        );
    }
}
