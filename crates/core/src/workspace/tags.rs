use schemars::JsonSchema;

use std::collections::BTreeMap;

use serde::Serialize;
use sqlx::{FromRow, Row, sqlite::SqliteRow};

use crate::common::{Status, now_iso};
use crate::fetch::fetch_by_id;
use crate::ids::{ProjectId, TagName};
use crate::{AppError, Db, Result};

pub const TAG_NAME_MAX_LENGTH: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct TagCount {
    pub tag: TagName,
    pub count: i64,
    pub active: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct TagRecord {
    pub name: TagName,
    pub archived: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct TagInventoryEntry {
    #[serde(flatten)]
    pub tag: TagRecord,
    pub count: i64,
    pub active: i64,
    pub backlog: i64,
}

#[derive(Debug, Clone, Default)]
pub struct TagQuery {
    pub project_ids: Vec<ProjectId>,
    pub statuses: Vec<Status>,
}

pub fn normalize_tag_name(raw: &str) -> String {
    raw.trim().to_lowercase()
}

pub fn tag_name_error(name: &str) -> Option<String> {
    if name.is_empty() {
        return Some("tag name is empty".to_string());
    }
    let length = name.encode_utf16().count();
    if length > TAG_NAME_MAX_LENGTH {
        return Some(format!(
            "tag name is too long: {length} characters, max {TAG_NAME_MAX_LENGTH}"
        ));
    }
    let mut bytes = name.bytes();
    let starts_well = bytes
        .next()
        .is_some_and(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit());
    let body_well = bytes.all(|byte| {
        byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'_'
    });
    if !starts_well || !body_well {
        return Some(format!(
            "tag name must start with a-z or 0-9 and contain only ascii a-z, 0-9, dash or underscore: \"{name}\""
        ));
    }
    None
}

impl<'r> FromRow<'r, SqliteRow> for TagRecord {
    fn from_row(row: &'r SqliteRow) -> sqlx::Result<Self> {
        Ok(TagRecord {
            name: TagName::new(row.get::<String, _>("name")),
            archived: row.get::<i64, _>("archived") == 1,
            created_at: row.get("created_at"),
        })
    }
}

pub async fn get_tag(db: &Db, raw: &str) -> Result<Option<TagRecord>> {
    fetch_by_id(
        sqlx::query("SELECT * FROM tags WHERE name = ?").bind(normalize_tag_name(raw)),
        db.pool(),
    )
    .await
}

pub async fn list_dictionary(db: &Db) -> Result<Vec<TagRecord>> {
    let rows = sqlx::query_as::<_, TagRecord>("SELECT * FROM tags ORDER BY name")
        .fetch_all(db.pool())
        .await?;
    Ok(rows)
}

pub async fn list_tags(db: &Db, query: &TagQuery) -> Result<Vec<TagCount>> {
    let active = Status::ACTIVE;
    let active_slots = vec!["?"; active.len()].join(", ");
    let mut sql = format!(
        "SELECT tt.tag AS tag, COUNT(*) AS count,
            SUM(CASE WHEN tasks.status IN ({active_slots}) THEN 1 ELSE 0 END) AS active
         FROM task_tags tt
         JOIN tasks ON tasks.id = tt.task_id
         WHERE tasks.deleted_at IS NULL
            AND tt.tag NOT IN (SELECT name FROM tags WHERE archived = 1)"
    );
    if !query.project_ids.is_empty() {
        let slots = vec!["?"; query.project_ids.len()].join(", ");
        sql.push_str(&format!(
            " AND tasks.project_id COLLATE NOCASE IN ({slots})"
        ));
    }
    if !query.statuses.is_empty() {
        let slots = vec!["?"; query.statuses.len()].join(", ");
        sql.push_str(&format!(" AND tasks.status IN ({slots})"));
    }
    sql.push_str(" GROUP BY tt.tag ORDER BY count DESC, tag ASC");

    let mut statement = sqlx::query(sqlx::AssertSqlSafe(sql));
    for status in active {
        statement = statement.bind(status.as_str());
    }
    for project_id in &query.project_ids {
        statement = statement.bind(project_id.as_str());
    }
    for status in &query.statuses {
        statement = statement.bind(status.as_str());
    }

    let rows = statement.fetch_all(db.pool()).await?;
    Ok(rows
        .iter()
        .map(|row| TagCount {
            tag: TagName::new(row.get::<String, _>("tag")),
            count: row.get("count"),
            active: row.get("active"),
        })
        .collect())
}

pub async fn list_tag_inventory(db: &Db) -> Result<Vec<TagInventoryEntry>> {
    let active = Status::ACTIVE;
    let active_slots = vec!["?"; active.len()].join(", ");
    let sql = format!(
        "SELECT tags.name AS name, tags.archived AS archived,
                tags.created_at AS created_at,
                (SELECT COUNT(*) FROM task_tags tt
                    JOIN tasks ON tasks.id = tt.task_id
                    WHERE tt.tag = tags.name AND tasks.deleted_at IS NULL) AS count,
                (SELECT COUNT(*) FROM task_tags tt
                    JOIN tasks ON tasks.id = tt.task_id
                    WHERE tt.tag = tags.name AND tasks.deleted_at IS NULL
                        AND tasks.status IN ({active_slots})) AS active,
                (SELECT COUNT(*) FROM task_tags tt
                    JOIN tasks ON tasks.id = tt.task_id
                    WHERE tt.tag = tags.name AND tasks.deleted_at IS NULL
                        AND tasks.status = 'backlog') AS backlog
            FROM tags
            ORDER BY tags.archived ASC, count DESC, tags.name ASC"
    );

    let mut statement = sqlx::query(sqlx::AssertSqlSafe(sql));
    for status in active {
        statement = statement.bind(status.as_str());
    }

    let rows = statement.fetch_all(db.pool()).await?;
    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        items.push(TagInventoryEntry {
            tag: TagRecord::from_row(&row)?,
            count: row.get("count"),
            active: row.get("active"),
            backlog: row.get("backlog"),
        });
    }
    Ok(items)
}

pub async fn ensure_tag(db: &Db, raw: &str) -> Result<TagRecord> {
    let name = normalize_tag_name(raw);
    if let Some(message) = tag_name_error(&name) {
        return Err(AppError::validation(message));
    }
    if let Some(existing) = get_tag(db, &name).await? {
        if !existing.archived {
            return Ok(existing);
        }
        sqlx::query("UPDATE tags SET archived = 0 WHERE name = ?")
            .bind(&name)
            .execute(db.pool())
            .await?;
        return Ok(TagRecord {
            archived: false,
            ..existing
        });
    }
    let created_at = now_iso();
    sqlx::query("INSERT INTO tags (name, archived, created_at) VALUES (?, 0, ?)")
        .bind(&name)
        .bind(&created_at)
        .execute(db.pool())
        .await?;
    Ok(TagRecord {
        name: TagName::new(name),
        archived: false,
        created_at,
    })
}

pub async fn set_tag_archived(db: &Db, raw: &str, archived: bool) -> Result<TagRecord> {
    let name = normalize_tag_name(raw);
    let Some(existing) = get_tag(db, &name).await? else {
        return Err(AppError::not_found(format!("tag {name} not found")));
    };
    if existing.archived != archived {
        sqlx::query("UPDATE tags SET archived = ? WHERE name = ?")
            .bind(i64::from(archived))
            .bind(&name)
            .execute(db.pool())
            .await?;
    }
    Ok(TagRecord {
        archived,
        ..existing
    })
}

pub async fn rename_tag(db: &Db, raw: &str, raw_next: &str) -> Result<TagRecord> {
    let name = normalize_tag_name(raw);
    let next = normalize_tag_name(raw_next);
    let Some(existing) = get_tag(db, &name).await? else {
        return Err(AppError::not_found(format!("tag {name} not found")));
    };
    if next == name {
        return Ok(existing);
    }
    if let Some(message) = tag_name_error(&next) {
        return Err(AppError::validation(message));
    }
    if get_tag(db, &next).await?.is_some() {
        return Err(AppError::conflict(format!("tag {next} already exists")));
    }

    let mut tx = db.begin().await?;
    sqlx::query("UPDATE tags SET name = ? WHERE name = ?")
        .bind(&next)
        .bind(&name)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    Ok(TagRecord {
        name: TagName::new(next),
        ..existing
    })
}

pub async fn validate_tags(db: &Db, tags: &[TagName]) -> Result<()> {
    if tags.is_empty() {
        return Ok(());
    }
    let dictionary = list_dictionary(db).await?;
    let active: Vec<&str> = dictionary
        .iter()
        .filter(|tag| !tag.archived)
        .map(|tag| tag.name.as_str())
        .collect();
    let unknown: Vec<&str> = tags
        .iter()
        .map(TagName::as_str)
        .filter(|tag| !active.contains(tag))
        .collect();
    if unknown.is_empty() {
        return Ok(());
    }

    let archived: Vec<&str> = unknown
        .iter()
        .copied()
        .filter(|tag| {
            dictionary
                .iter()
                .any(|entry| entry.name.as_str() == *tag && entry.archived)
        })
        .collect();

    let usage_entries = list_tags(db, &TagQuery::default()).await?;
    let usage: BTreeMap<&str, i64> = usage_entries
        .iter()
        .map(|entry| (entry.tag.as_str(), entry.count))
        .collect();

    let options = active
        .iter()
        .map(|name| format!("{name} ({})", usage.get(name).copied().unwrap_or(0)))
        .collect::<Vec<_>>()
        .join(", ");
    let hints = unknown
        .iter()
        .filter_map(|name| {
            close_tag(name, &active).map(|match_| format!(" Did you mean '{match_}' for '{name}'?"))
        })
        .collect::<String>();
    let next_steps = unknown
        .iter()
        .map(|name| format!("tags_create {{name: \"{name}\"}}"))
        .collect::<Vec<_>>()
        .join(", ");
    let archived_part = if archived.is_empty() {
        String::new()
    } else {
        format!(
            " Archived: {} - restore with tags_update {{name, patch:{{archived:false}}}} or pick another.",
            archived.join(", ")
        )
    };

    Err(AppError::validation(format!(
        "unknown tag(s): {}.{hints} Existing tags: {options} ({} total). Add a genuinely new tag with {next_steps}, then retry the call.{archived_part}",
        unknown.join(", "),
        active.len()
    )))
}

fn close_tag<'a>(name: &str, active: &'a [&str]) -> Option<&'a str> {
    active
        .iter()
        .copied()
        .filter(|candidate| {
            let distance = edit_distance(name, candidate);
            distance > 0 && distance <= 2 && distance < name.len().max(candidate.len())
        })
        .min_by_key(|candidate| edit_distance(name, candidate))
}

fn edit_distance(left: &str, right: &str) -> usize {
    let mut row: Vec<usize> = (0..=right.len()).collect();
    for (i, a) in left.bytes().enumerate() {
        let mut previous = row[0];
        row[0] = i + 1;
        for (j, b) in right.bytes().enumerate() {
            let current = row[j + 1];
            row[j + 1] = (row[j + 1] + 1)
                .min(row[j] + 1)
                .min(previous + usize::from(a != b));
            previous = current;
        }
    }
    row[right.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_tag_names_like_node() {
        assert_eq!(normalize_tag_name("  Bug "), "bug");
        assert_eq!(tag_name_error("bug"), None);
        assert_eq!(tag_name_error("design-ui_2"), None);
        assert_eq!(tag_name_error(""), Some("tag name is empty".to_string()));
        assert_eq!(
            tag_name_error(&"a".repeat(21)),
            Some("tag name is too long: 21 characters, max 20".to_string())
        );
        assert_eq!(
            tag_name_error("-bug"),
            Some(
                "tag name must start with a-z or 0-9 and contain only ascii a-z, 0-9, dash or underscore: \"-bug\""
                    .to_string()
            )
        );
        assert!(tag_name_error("b ug").is_some());
        assert!(tag_name_error("büg").is_some());
    }

    #[test]
    fn suggests_the_closest_tag_for_a_typo() {
        let active = ["bug", "docs", "tests", "tech-debt"];
        assert_eq!(close_tag("test", &active), Some("tests"));
        assert_eq!(close_tag("tech-debts", &active), Some("tech-debt"));
        assert_eq!(close_tag("refactor", &active), None);
        assert_eq!(close_tag("bug", &active), None);
    }

    #[test]
    fn serializes_a_record_and_an_inventory_entry() {
        let record = TagRecord {
            name: TagName::new("bug"),
            archived: false,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        };
        assert_eq!(
            serde_json::to_value(&record).unwrap(),
            serde_json::json!({
                "name": "bug",
                "archived": false,
                "created_at": "2026-01-01T00:00:00.000Z"
            })
        );
        let entry = TagInventoryEntry {
            tag: record,
            count: 2,
            active: 1,
            backlog: 1,
        };
        assert_eq!(
            serde_json::to_value(&entry).unwrap(),
            serde_json::json!({
                "name": "bug",
                "archived": false,
                "created_at": "2026-01-01T00:00:00.000Z",
                "count": 2,
                "active": 1,
                "backlog": 1
            })
        );
    }
}
