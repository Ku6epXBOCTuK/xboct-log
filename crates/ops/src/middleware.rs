use serde_json::{Value, json};

pub const UI_PAGE_SIZE: u32 = 50;
pub const RESPONSE_BUDGET_BYTES: usize = 24 * 1024;

const UI_FIELDS: &[&str] = &[
    "title",
    "status",
    "priority",
    "is_epic",
    "epic_id",
    "scope_id",
    "tags",
    "estimate",
    "due_at",
    "attachments_count",
    "created_at",
    "closed_at",
    "blocked_by",
    "blocks",
];

pub fn ui_request(input: &mut Value) {
    let Some(object) = input.as_object_mut() else {
        return;
    };
    let Some(page) = object
        .get("page")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .filter(|value| *value > 0)
    else {
        return;
    };
    object.remove("page");
    object.insert(
        "offset".to_string(),
        json!((page - 1).saturating_mul(UI_PAGE_SIZE)),
    );
    object.insert("limit".to_string(), json!(UI_PAGE_SIZE));
    object.insert("fields".to_string(), json!(UI_FIELDS));
    for key in [
        "include_description",
        "description_chars",
        "include_plan_names",
        "include_project",
        "include_scope",
    ] {
        object.remove(key);
    }
}

pub fn mcp_response(value: &mut Value) {
    let Ok(full) = serde_json::to_string(value) else {
        return;
    };
    if full.len() <= RESPONSE_BUDGET_BYTES {
        return;
    }
    let Some(items) = value.get_mut("items").and_then(Value::as_array_mut) else {
        return;
    };
    let item_lengths: Vec<usize> = items
        .iter()
        .map(|item| {
            serde_json::to_string(item)
                .map(|json| json.len())
                .unwrap_or(0)
        })
        .collect();
    let overhead = full
        .len()
        .saturating_sub(item_lengths.iter().sum::<usize>());
    let mut bytes = overhead;
    let mut keep = 0usize;
    for length in item_lengths {
        if keep > 0 && bytes.saturating_add(length) > RESPONSE_BUDGET_BYTES {
            break;
        }
        bytes = bytes.saturating_add(length);
        keep += 1;
    }
    items.truncate(keep);
    if value.get("size").is_some() {
        value["size"] = json!(keep);
    }
    if value.get("total").is_some() {
        let offset = value.get("offset").and_then(Value::as_i64).unwrap_or(0);
        let next = offset.saturating_add(i64::try_from(keep).unwrap_or(i64::MAX));
        let more = value
            .get("total")
            .and_then(Value::as_i64)
            .is_some_and(|total| total > next);
        if more {
            value["next_offset"] = json!(next);
        } else if let Some(object) = value.as_object_mut() {
            object.remove("next_offset");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ui_request_turns_a_page_into_a_compact_limit_and_offset() {
        let mut input = json!({
            "page": 3,
            "include_description": true,
            "description_chars": 2000,
            "include_plan_names": true,
            "include_project": true,
            "include_scope": true,
            "project_id": "log"
        });
        ui_request(&mut input);
        assert!(input.get("page").is_none());
        assert_eq!(input["offset"], 100);
        assert_eq!(input["limit"], UI_PAGE_SIZE);
        assert_eq!(input["fields"][0], "title");
        assert!(input.get("include_description").is_none());
        assert!(input.get("description_chars").is_none());
        assert!(input.get("include_plan_names").is_none());
        assert!(input.get("include_project").is_none());
        assert!(input.get("include_scope").is_none());
        assert_eq!(input["project_id"], "log");
    }

    #[test]
    fn ui_request_leaves_non_paged_requests_untouched() {
        let mut input = json!({"task_id": "LOG-1"});
        ui_request(&mut input);
        assert_eq!(input, json!({"task_id": "LOG-1"}));
    }

    #[test]
    fn mcp_response_truncates_only_over_budget_lists() {
        let mut small = json!({"items": [{"id": "LOG-1"}], "total": 1, "size": 1});
        mcp_response(&mut small);
        assert_eq!(small["items"].as_array().unwrap().len(), 1);

        let mut big = json!({
            "items": (1..=60)
                .map(|number| json!({"id": format!("LOG-{number}"), "description": "x".repeat(1000)}))
                .collect::<Vec<_>>(),
            "total": 60,
            "offset": 0,
            "size": 60,
            "page_size": 60
        });
        mcp_response(&mut big);
        let size = big["size"].as_u64().unwrap();
        assert!(size > 0 && size < 60);
        assert_eq!(big["items"].as_array().unwrap().len() as u64, size);
        assert_eq!(big["next_offset"], size);
        assert_eq!(big["page_size"], 60);
        assert!(serde_json::to_string(&big).unwrap().len() <= RESPONSE_BUDGET_BYTES);
    }

    #[test]
    fn mcp_response_clears_next_offset_when_the_last_page_is_truncated() {
        let mut page = json!({
            "items": (1..=20)
                .map(|number| json!({"id": number, "description": "x".repeat(2000)}))
                .collect::<Vec<_>>(),
            "total": 1,
            "offset": 0,
            "size": 20,
            "page_size": 20,
            "next_offset": 999
        });
        mcp_response(&mut page);
        assert!(page.get("next_offset").is_none());
        let size = page["size"].as_u64().unwrap();
        assert!(size > 0 && size < 20);
    }
}
