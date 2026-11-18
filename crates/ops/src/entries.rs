use serde_json::Value;
use xboct_log_core::{ActivityEntity, ActivityEntry};

pub fn entries(op: &str, input: &Value, output: &Value) -> Vec<ActivityEntry> {
    match op {
        "tasks_create" => vec![ActivityEntry::task(
            text(output, "id"),
            creation_fields(input),
            Vec::new(),
        )],
        "tasks_create_many" => items(output)
            .iter()
            .filter(|item| item.get("ok") == Some(&Value::Bool(true)))
            .enumerate()
            .map(|(index, item)| {
                let source = input
                    .get("items")
                    .and_then(|items| items.get(index))
                    .cloned()
                    .unwrap_or(Value::Null);
                ActivityEntry::task(
                    nested_text(item.get("task"), "id"),
                    creation_fields(&source),
                    Vec::new(),
                )
            })
            .collect(),
        "tasks_update" => {
            let mut entries = vec![ActivityEntry::task(
                text(output, "id"),
                patch_fields(input),
                array(output.get("changes")),
            )];
            entries.extend(epic_entries(output));
            entries
        }
        "tasks_update_many" => items(output)
            .iter()
            .filter(|item| item.get("ok") == Some(&Value::Bool(true)))
            .flat_map(|item| {
                let index = item.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                let source = input
                    .get("items")
                    .and_then(|items| items.get(index))
                    .cloned()
                    .unwrap_or(Value::Null);
                let mut entries = vec![ActivityEntry::task(
                    nested_text(item.get("task"), "id"),
                    patch_fields(&source),
                    array(item.get("changes")),
                )];
                entries.extend(epic_entries(item));
                entries
            })
            .collect(),
        "tasks_close" => {
            let mut entries = vec![ActivityEntry::task(
                text(output, "id"),
                strings(&["status", "closed_reason"]),
                array(output.get("changes")),
            )];
            entries.extend(released_entries(output.get("released")));
            entries.extend(epic_entries(output));
            entries
        }
        "tasks_close_many" => items(output)
            .iter()
            .filter(|item| item.get("ok") == Some(&Value::Bool(true)))
            .flat_map(|item| {
                let mut entries = vec![ActivityEntry::task(
                    nested_text(item.get("task"), "id"),
                    strings(&["status", "closed_reason"]),
                    array(item.get("changes")),
                )];
                entries.extend(released_entries(item.get("released")));
                entries.extend(epic_entries(item));
                entries
            })
            .collect(),
        "tasks_delete" => {
            let mut entries = vec![ActivityEntry::task(
                text(output, "id"),
                strings(&["deleted_at"]),
                array(output.get("changes")),
            )];
            entries.extend(released_entries(output.get("released")));
            entries
        }
        "tasks_restore" => vec![ActivityEntry::task(
            text(output, "id"),
            strings(&["deleted_at"]),
            Vec::new(),
        )],
        "tasks_move" => vec![ActivityEntry::task(
            text(output, "id"),
            strings(&["project_id"]),
            Vec::new(),
        )],
        "tasks_add_link" | "tasks_remove_link" => {
            let field = text(input, "link_type");
            let fields = if field.is_empty() {
                Vec::new()
            } else {
                vec![field]
            };
            vec![ActivityEntry::task(
                text(output, "id"),
                fields,
                array(output.get("changes")),
            )]
        }
        "tasks_add_blocker" | "tasks_remove_blocker" => vec![ActivityEntry::task(
            text(output, "id"),
            strings(&["blocked_by"]),
            array(output.get("changes")),
        )],
        "tasks_comments_add" | "tasks_comments_edit" | "tasks_comments_delete" => {
            vec![ActivityEntry::task(
                text(output, "task_id"),
                strings(&["comments"]),
                Vec::new(),
            )]
        }
        "projects_create" => vec![ActivityEntry::new(
            ActivityEntity::Project,
            text(output, "id"),
            present_fields(input, &["project_id", "name", "prefix", "repo"]),
            Vec::new(),
        )],
        "projects_update" => vec![ActivityEntry::new(
            ActivityEntity::Project,
            text(output, "id"),
            present_fields(
                input.get("patch").unwrap_or(&Value::Null),
                &["name", "archived", "repo"],
            ),
            Vec::new(),
        )],
        "scopes_create" => vec![ActivityEntry::new(
            ActivityEntity::Scope,
            number_text(output, "id"),
            present_fields(input, &["project_id", "name"]),
            Vec::new(),
        )],
        "scopes_update" => vec![ActivityEntry::new(
            ActivityEntity::Scope,
            number_text(output, "id"),
            present_fields(input.get("patch").unwrap_or(&Value::Null), &["name"]),
            Vec::new(),
        )],
        "scopes_delete" => {
            if input
                .get("dry_run")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                return Vec::new();
            }
            let scope_id = number_text(input, "scope_id");
            let mut entries = vec![ActivityEntry::new(
                ActivityEntity::Scope,
                scope_id.clone(),
                Vec::new(),
                Vec::new(),
            )];
            for key in ["task_ids", "epic_ids"] {
                for task in array(output.get(key)) {
                    let task_id = task.as_str().unwrap_or_default().to_string();
                    if task_id.is_empty() {
                        continue;
                    }
                    entries.push(ActivityEntry::task(
                        task_id,
                        strings(&["scope_id"]),
                        vec![serde_json::json!({
                            "field": "scope_id",
                            "from": scope_id.parse::<i64>().ok(),
                            "to": null,
                        })],
                    ));
                }
            }
            entries
        }
        "tags_create" => vec![ActivityEntry::new(
            ActivityEntity::Tag,
            text(output, "name"),
            present_fields(input, &["name"]),
            Vec::new(),
        )],
        "tags_update" => vec![ActivityEntry::new(
            ActivityEntity::Tag,
            text(output, "name"),
            present_fields(input.get("patch").unwrap_or(&Value::Null), &["archived"]),
            Vec::new(),
        )],
        "tags_rename" => vec![ActivityEntry::new(
            ActivityEntity::Tag,
            text(output, "name"),
            strings(&["name"]),
            vec![serde_json::json!({
                "field": "name",
                "from": text(input, "name"),
                "to": text(output, "name"),
            })],
        )],
        "plans_create" => vec![ActivityEntry::new(
            ActivityEntity::Plan,
            text(output, "id"),
            present_fields(input, &["name", "description", "status"]),
            Vec::new(),
        )],
        "plans_update" => vec![ActivityEntry::new(
            ActivityEntity::Plan,
            text(output, "id"),
            present_fields(
                input.get("patch").unwrap_or(&Value::Null),
                &["name", "description", "status"],
            ),
            Vec::new(),
        )],
        "plans_delete" | "plans_restore" => vec![ActivityEntry::new(
            ActivityEntity::Plan,
            text(output, "id"),
            strings(&["deleted_at"]),
            Vec::new(),
        )],
        "plans_items_add" | "plans_items_remove" | "plans_reorder" => vec![ActivityEntry::new(
            ActivityEntity::Plan,
            text(input, "plan_id"),
            strings(&["items"]),
            Vec::new(),
        )],
        "plans_notes_add" | "plans_notes_edit" | "plans_notes_delete" => {
            let from_input = text(input, "plan_id");
            let plan_id = if from_input.is_empty() {
                text(output, "plan_id")
            } else {
                from_input
            };
            vec![ActivityEntry::new(
                ActivityEntity::Plan,
                plan_id,
                strings(&["notes"]),
                Vec::new(),
            )]
        }
        "attachments_add" | "attachments_copy" => attachment_entry(output.get("item"), true),
        "attachments_restore" => attachment_entry(Some(output), true),
        "attachments_delete" | "attachments_purge" => attachment_entry(Some(output), false),
        "attachments_move" => {
            let item = output.get("item").cloned().unwrap_or(Value::Null);
            if output.get("was_deleted").and_then(Value::as_bool) == Some(true) {
                return attachment_entry(Some(&item), true);
            }
            let previous = text(output, "previous_task_id");
            let mut entries = attachment_entry_for(&item, &previous, false);
            entries.extend(attachment_entry(Some(&item), true));
            entries
        }
        _ => Vec::new(),
    }
}

fn attachment_entry(item: Option<&Value>, present: bool) -> Vec<ActivityEntry> {
    let Some(item) = item else {
        return Vec::new();
    };
    let task_id = text(item, "task_id");
    attachment_entry_for(item, &task_id, present)
}

fn attachment_entry_for(item: &Value, task_id: &str, present: bool) -> Vec<ActivityEntry> {
    let file_name = text(item, "file_name");
    let (from, to) = if present {
        (Value::Null, Value::from(file_name))
    } else {
        (Value::from(file_name), Value::Null)
    };
    vec![ActivityEntry::task(
        task_id,
        strings(&["attachments"]),
        vec![serde_json::json!({
            "field": "attachments",
            "from": from,
            "to": to,
            "ref_id": text(item, "id"),
        })],
    )]
}

fn strings(fields: &[&str]) -> Vec<String> {
    fields.iter().map(|field| (*field).to_string()).collect()
}

fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn nested_text(value: Option<&Value>, key: &str) -> String {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn number_text(value: &Value, key: &str) -> String {
    match value.get(key) {
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::String(text)) => text.clone(),
        _ => String::new(),
    }
}

fn present_fields(value: &Value, names: &[&str]) -> Vec<String> {
    let Some(object) = value.as_object() else {
        return Vec::new();
    };
    names
        .iter()
        .filter(|name| object.contains_key(**name))
        .map(|name| (*name).to_string())
        .collect()
}

fn array(value: Option<&Value>) -> Vec<Value> {
    match value {
        Some(Value::Array(items)) => items.clone(),
        _ => Vec::new(),
    }
}

fn items(value: &Value) -> Vec<Value> {
    match value.get("items") {
        Some(Value::Array(items)) => items.clone(),
        _ => Vec::new(),
    }
}

fn epic_entries(value: &Value) -> Vec<ActivityEntry> {
    ["closed_epic", "reopened_epic"]
        .iter()
        .filter_map(|key| value.get(*key))
        .map(|epic| {
            ActivityEntry::task(
                text(epic, "id"),
                strings(&["status", "closed_reason"]),
                Vec::new(),
            )
        })
        .collect()
}

fn released_entries(released: Option<&Value>) -> Vec<ActivityEntry> {
    match released {
        Some(Value::Array(items)) => items
            .iter()
            .map(|link| {
                let changes = array(link.get("changes"));
                let fields = changes
                    .iter()
                    .filter_map(|change| change.get("field").and_then(Value::as_str))
                    .map(str::to_string)
                    .collect();
                ActivityEntry::task(text(link, "task_id"), fields, changes)
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn patch_fields(input: &Value) -> Vec<String> {
    let patch = match input.get("patch") {
        Some(Value::Object(fields)) => fields,
        _ => match input.as_object() {
            Some(fields) => {
                return fields
                    .keys()
                    .filter(|key| key.as_str() != "task_id")
                    .cloned()
                    .collect();
            }
            None => return Vec::new(),
        },
    };
    patch.keys().cloned().collect()
}

fn creation_fields(input: &Value) -> Vec<String> {
    let mut fields = Vec::new();
    let text_is_set = |key: &str| {
        input
            .get(key)
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
    };
    if text_is_set("description") {
        fields.push("description".to_string());
    }
    if let Some(status) = input.get("status")
        && status != "backlog"
    {
        fields.push("status".to_string());
    }
    if let Some(priority) = input.get("priority")
        && priority != "medium"
    {
        fields.push("priority".to_string());
    }
    if input.get("is_epic").and_then(Value::as_bool) == Some(true) {
        fields.push("is_epic".to_string());
    }
    if text_is_set("epic_id") {
        fields.push("epic_id".to_string());
    }
    let has_scope_id = input.get("scope_id").is_some_and(|value| !value.is_null());
    if has_scope_id || text_is_set("scope") {
        fields.push("scope_id".to_string());
    }
    if text_is_set("source_file") {
        fields.push("source_file".to_string());
    }
    if input
        .get("tags")
        .and_then(Value::as_array)
        .is_some_and(|tags| !tags.is_empty())
    {
        fields.push("tags".to_string());
    }
    if input.get("estimate").is_some_and(|value| !value.is_null()) {
        fields.push("estimate".to_string());
    }
    if text_is_set("assignee") {
        fields.push("assignee".to_string());
    }
    if text_is_set("due_at") {
        fields.push("due_at".to_string());
    }
    fields
}
