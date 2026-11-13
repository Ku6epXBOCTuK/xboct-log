use std::{
    collections::{BTreeMap, HashMap},
    sync::OnceLock,
};

use chrono::DateTime;
use regex::{Captures, Regex};
use serde_json::{Map, Value};

const DAY_MS: i64 = 86_400_000;

fn uuid_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(r"(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$").unwrap()
    })
}

fn stored_name_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(
            r"(?i)^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\.[A-Za-z0-9]+)$",
        )
        .unwrap()
    })
}

fn timestamp_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$").unwrap())
}

fn backup_name_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(
            r"xboct-log-(before-restore-)?(?:\d{4}-W\d{2}|\d{4}-\d{2}-\d{2}(?:-\d{6}|T[0-9:.Z-]+)?)\.db",
        )
        .unwrap()
    })
}

fn attachment_uri_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(
            r"(?i)xboct-log://attachment/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
        )
        .unwrap()
    })
}

pub struct Normalizer {
    now_ms: i64,
    runtime: Option<String>,
    identities: HashMap<String, String>,
    uuids: HashMap<String, String>,
}

impl Normalizer {
    pub fn new(now_ms: i64, runtime: Option<&str>, identities: HashMap<String, String>) -> Self {
        let runtime = runtime.map(|value| {
            let portable = value.replace('\\', "/");
            portable.strip_suffix('/').unwrap_or(&portable).to_owned()
        });
        Self {
            now_ms,
            runtime,
            identities,
            uuids: HashMap::new(),
        }
    }

    pub fn normalize(&mut self, value: &Value) -> Value {
        match value {
            Value::String(text) => Value::String(self.normalize_string(text)),
            Value::Array(items) => {
                Value::Array(items.iter().map(|item| self.normalize(item)).collect())
            }
            Value::Object(fields) => Value::Object(
                fields
                    .iter()
                    .map(|(key, entry)| (key.clone(), self.normalize(entry)))
                    .collect(),
            ),
            other => other.clone(),
        }
    }

    pub fn normalize_string(&mut self, value: &str) -> String {
        if value.contains("xboct-log://attachment/") {
            let rewritten = self.rewrite_attachment_uris(value);
            if rewritten != value {
                return rewritten;
            }
        }

        if uuid_regex().is_match(value) {
            return self.normalize_uuid(value);
        }

        if let Some(captures) = stored_name_regex().captures(value) {
            return format!("{}{}", self.normalize_uuid(&captures[1]), &captures[2]);
        }

        if timestamp_regex().is_match(value)
            && let Ok(parsed) = DateTime::parse_from_rfc3339(value)
            && (parsed.timestamp_millis() - self.now_ms).abs() <= DAY_MS
        {
            return "<now>".to_owned();
        }

        if let Some(runtime) = self.runtime.clone() {
            let stamped = backup_name_regex()
                .replace_all(value, |captures: &Captures| {
                    let safety = captures.get(1).map_or("", |group| group.as_str());
                    format!("xboct-log-{safety}<stamp>.db")
                })
                .into_owned();
            let portable = stamped.replace('\\', "/");
            if portable == runtime {
                return "<runtime>".to_owned();
            }
            if let Some(rest) = portable.strip_prefix(runtime.as_str())
                && rest.starts_with('/')
            {
                return format!("<runtime>{rest}");
            }
            if stamped != value {
                return stamped;
            }
        }

        if (value.starts_with('[') || value.starts_with('{'))
            && let Ok(parsed) = serde_json::from_str::<Value>(value)
        {
            return serde_json::to_string(&self.normalize(&parsed))
                .unwrap_or_else(|_| value.to_owned());
        }

        value.to_owned()
    }

    fn rewrite_attachment_uris(&mut self, value: &str) -> String {
        let mut output = String::with_capacity(value.len());
        let mut cursor = 0;
        let matches: Vec<(usize, usize, String)> = attachment_uri_regex()
            .captures_iter(value)
            .filter_map(|captures| {
                let whole = captures.get(0)?;
                let uuid = captures.get(1)?.as_str().to_owned();
                Some((whole.start(), whole.end(), uuid))
            })
            .collect();
        for (start, end, uuid) in matches {
            output.push_str(&value[cursor..start]);
            output.push_str("xboct-log://attachment/");
            output.push_str(&self.normalize_uuid(&uuid));
            cursor = end;
        }
        output.push_str(&value[cursor..]);
        output
    }

    fn normalize_uuid(&mut self, value: &str) -> String {
        let key = value.to_lowercase();
        if let Some(known) = self.identities.get(&key) {
            return known.clone();
        }
        if let Some(existing) = self.uuids.get(&key) {
            return existing.clone();
        }
        let placeholder = format!("<uuid:{}>", self.uuids.len() + 1);
        self.uuids.insert(key, placeholder.clone());
        placeholder
    }
}

pub fn identities_of(rows: &BTreeMap<String, Vec<Map<String, Value>>>) -> HashMap<String, String> {
    let mut identities = HashMap::new();
    if let Some(tasks) = rows.get("tasks") {
        for task in tasks {
            if let (Some(id), Some(key)) = (task.get("id"), task.get("key"))
                && let (Some(id), Some(key)) = (id.as_str(), key.as_str())
            {
                identities.insert(id.to_lowercase(), format!("task:{key}"));
            }
        }
    }
    if let Some(attachments) = rows.get("task_attachments") {
        for (index, attachment) in attachments.iter().enumerate() {
            if let Some(id) = attachment.get("id").and_then(Value::as_str) {
                identities.insert(id.to_lowercase(), format!("attachment:{}", index + 1));
            }
        }
    }
    if let Some(comments) = rows.get("task_comments") {
        for (index, comment) in comments.iter().enumerate() {
            if let Some(id) = comment.get("id").and_then(Value::as_str) {
                identities.insert(id.to_lowercase(), format!("comment:{}", index + 1));
            }
        }
    }
    identities
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn normalizer() -> Normalizer {
        Normalizer::new(
            1_800_000_000_000,
            Some(r"C:\work\tests\parity\.tmp\runtime"),
            HashMap::new(),
        )
    }

    #[test]
    fn names_a_uuid_after_its_first_use() {
        let mut normalizer = normalizer();
        let first = "0f8fad5b-d9cb-469f-a165-70867728950e";
        let second = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

        assert_eq!(normalizer.normalize_string(first), "<uuid:1>");
        assert_eq!(normalizer.normalize_string(first), "<uuid:1>");
        assert_eq!(normalizer.normalize_string(second), "<uuid:2>");
    }

    #[test]
    fn prefers_the_database_identity() {
        let mut identities = HashMap::new();
        identities.insert(
            "0f8fad5b-d9cb-469f-a165-70867728950e".to_owned(),
            "task:LOG-1".to_owned(),
        );
        let mut normalizer = Normalizer::new(1_800_000_000_000, None, identities);

        assert_eq!(
            normalizer.normalize_string("0f8fad5b-d9cb-469f-a165-70867728950e"),
            "task:LOG-1"
        );
    }

    #[test]
    fn keeps_the_extension_of_a_stored_name() {
        let mut normalizer = normalizer();
        assert_eq!(
            normalizer.normalize_string("0f8fad5b-d9cb-469f-a165-70867728950e.png"),
            "<uuid:1>.png"
        );
    }

    #[test]
    fn rewrites_attachment_uris_in_a_sentence() {
        let mut normalizer = normalizer();
        assert_eq!(
            normalizer.normalize_string(
                "see xboct-log://attachment/0f8fad5b-d9cb-469f-a165-70867728950e for details"
            ),
            "see xboct-log://attachment/<uuid:1> for details"
        );
    }

    #[test]
    fn stamps_recent_timestamps_only() {
        let mut normalizer = normalizer();
        assert_eq!(
            normalizer.normalize_string("2027-01-15T12:00:00.000Z"),
            "<now>"
        );
        assert_eq!(
            normalizer.normalize_string("2026-12-01T00:00:00.000Z"),
            "2026-12-01T00:00:00.000Z"
        );
        assert_eq!(normalizer.normalize_string("2026-12-01"), "2026-12-01");
    }

    #[test]
    fn hides_the_runtime_folder_and_backup_stamps() {
        let mut normalizer = normalizer();
        assert_eq!(
            normalizer.normalize_string(
                r"C:\work\tests\parity\.tmp\runtime\backups\manual\xboct-log-2027-01-15-120000.db"
            ),
            "<runtime>/backups/manual/xboct-log-<stamp>.db"
        );
        assert_eq!(
            normalizer.normalize_string(
                r"C:\work\tests\parity\.tmp\runtime\backups\manual\xboct-log-before-restore-2027-01-15T12-00-00-000Z.db"
            ),
            "<runtime>/backups/manual/xboct-log-before-restore-<stamp>.db"
        );
    }

    #[test]
    fn walks_json_stored_in_a_string() {
        let mut normalizer = normalizer();
        let value = json!({
            "fields": "[\"status\"]",
            "changes": "[{\"field\":\"status\",\"from\":\"open\",\"to\":\"done\"}]"
        });

        assert_eq!(
            normalizer.normalize(&value),
            json!({
                "fields": "[\"status\"]",
                "changes": "[{\"field\":\"status\",\"from\":\"open\",\"to\":\"done\"}]"
            })
        );
    }

    #[test]
    fn normalizes_json_values_inside_a_string() {
        let mut normalizer = normalizer();
        let value = json!({
            "entities": "[\"0f8fad5b-d9cb-469f-a165-70867728950e\"]"
        });

        assert_eq!(
            normalizer.normalize(&value),
            json!({ "entities": "[\"<uuid:1>\"]" })
        );
    }
}
