use super::*;
use rmcp::model::ResultType;
use xboct_log_core::{Config, Events, OpName};

async fn backlog() -> Backlog {
    let db = Db::open(":memory:").await.unwrap();
    db.migrate().await.unwrap();
    let hint = mcp_text::active_tags_hint(&db).await.unwrap();
    let config =
        Config::from_lookup(|name| (name == "XBOCT_LOG_DB").then(|| ":memory:".to_string()))
            .unwrap();
    Backlog::new(
        Arc::new(db),
        Arc::new(config),
        Arc::new(Events::new()),
        hint,
    )
}

#[tokio::test]
async fn lists_every_tool_with_brief_descriptions_for_rare_ones() {
    let backlog = backlog().await;
    let listed = tools(&backlog.db).await.unwrap();
    let names: Vec<String> = listed.iter().map(|tool| tool.name.to_string()).collect();
    assert_eq!(
        names.len(),
        metadata().iter().filter(|info| info.mcp).count() + 3
    );
    for expected in [
        "tasks_list",
        "plans_notes_add",
        "tasks_delete",
        "plans_notes_delete",
        "attachments_read",
        "xboct_log_tool_description",
        "xboct_log_call",
    ] {
        assert!(names.iter().any(|name| name == expected), "{expected}");
    }

    let find = |name: &str| {
        listed
            .iter()
            .find(|tool| tool.name == name)
            .unwrap_or_else(|| panic!("{name} is listed"))
    };
    let common = find("tasks_list");
    let full = metadata()
        .into_iter()
        .find(|info| info.name == "tasks_list")
        .unwrap()
        .description;
    assert_eq!(common.description.as_deref(), Some(full));
    assert!(common.output_schema.is_some());
    assert!(common.input_schema.contains_key("properties"));

    let create = find("tasks_create");
    let create_description = create.description.as_deref().unwrap_or_default();
    assert!(
        create_description.contains("Active tags (0)"),
        "{create_description}"
    );
    let tags = create.input_schema["properties"]["tags"]["description"]
        .as_str()
        .unwrap_or_default();
    assert!(tags.contains("Active tags (0)"), "{tags}");

    let rare = find("tasks_delete");
    let brief = rare.description.as_deref().unwrap();
    assert!(brief.contains("Get the argument schema"), "{brief}");
    assert_eq!(
        &*rare.input_schema,
        json!({"type":"object"}).as_object().unwrap()
    );
    assert!(rare.output_schema.is_none());

    let attachment = find("attachments_read");
    assert!(
        attachment
            .description
            .as_deref()
            .unwrap()
            .contains("xboct_log_tool_description")
    );
    assert!(attachment.output_schema.is_none());
}

#[test]
fn instructions_cover_every_tool_and_everyday_arguments() {
    let text = mcp_text::build_instructions(
        &tool_names(),
        &everyday_arguments(),
        "Active tags (1): demo. Create a genuinely new one with tags_create {name: \"...\"} first, then retry the call.",
    );
    assert!(text.contains("Active tags (1): demo"), "{text}");
    for info in metadata().into_iter().filter(|info| info.mcp) {
        assert!(
            text.contains(&format!("- {}: ", info.name)),
            "{} is named in the instructions",
            info.name
        );
    }
    for name in [
        "attachments_read",
        "xboct_log_tool_description",
        "xboct_log_call",
    ] {
        assert!(text.contains(&format!("- {name}: ")), "{name}");
    }
    for info in metadata().into_iter().filter(|info| info.mcp && !info.lazy) {
        let (input, _) = tool_schema(info.name).expect("everyday schema");
        let line = text
            .lines()
            .find(|line| line.starts_with(&format!("- {}(", info.name)))
            .unwrap_or_else(|| panic!("{} arguments are listed", info.name));
        for field in input["required"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            assert!(
                line.contains(&format!("{field}: ")),
                "{} lists required {field}: {line}",
                info.name
            );
        }
    }
}

#[tokio::test]
async fn tag_dictionary_reaches_tool_descriptions_and_instructions() {
    let backlog = backlog().await;
    sqlx::query("INSERT INTO tags (name, archived, created_at) VALUES ('refactor', 0, '2026-01-01T00:00:00.000Z')")
        .execute(backlog.db.pool())
        .await
        .unwrap();

    let listed = tools(&backlog.db).await.unwrap();
    let create = listed
        .iter()
        .find(|tool| tool.name == "tasks_create")
        .unwrap();
    let description = create.description.as_deref().unwrap_or_default();
    assert!(
        description.contains("Active tags (1): refactor"),
        "{description}"
    );

    let (_, _, result) = backlog
        .call_named(
            "xboct_log_tool_description",
            json!({"query": "tasks_create"}),
            None,
        )
        .await;
    let description = result.structured_content.unwrap()["items"][0]["description"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    assert!(
        description.contains("Active tags (1): refactor"),
        "{description}"
    );

    let hint = mcp_text::active_tags_hint(&backlog.db).await.unwrap();
    let text = mcp_text::build_instructions(&tool_names(), &everyday_arguments(), &hint);
    assert!(text.contains("Active tags (1): refactor"), "{text}");
}

#[tokio::test]
async fn tool_description_and_call_reach_rare_tools() {
    let backlog = backlog().await;
    let (name, _, result) = backlog
        .call_named(
            "xboct_log_tool_description",
            json!({"query": "restore deleted task"}),
            None,
        )
        .await;
    assert_eq!(name, "xboct_log_tool_description");
    assert_eq!(result.is_error, None);
    let payload = result.structured_content.unwrap();
    let items = payload["items"].as_array().unwrap();
    assert!(items.iter().any(|item| item["name"] == "tasks_restore"));
    assert!(items.iter().any(|item| {
        item["params"]
            .as_array()
            .is_some_and(|params| params.iter().any(|param| param["name"] == "task_id"))
    }));

    let (_, _, result) = backlog
        .call_named(
            "xboct_log_tool_description",
            json!({"query": "attachment file"}),
            None,
        )
        .await;
    let payload = result.structured_content.unwrap();
    assert!(
        payload["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["name"] == "attachments_read")
    );

    let (_, _, result) = backlog
        .call_named(
            "xboct_log_tool_description",
            json!({"query": "tasks_delete"}),
            None,
        )
        .await;
    let payload = result.structured_content.unwrap();
    let item = &payload["items"][0];
    let full = metadata()
        .into_iter()
        .find(|info| info.name == "tasks_delete")
        .unwrap()
        .description;
    assert_eq!(item["name"], "tasks_delete");
    assert_eq!(item["description"], full);

    let (_, _, result) = backlog
        .call_named(
            "xboct_log_tool_description",
            json!({"query": "tasks_create"}),
            None,
        )
        .await;
    let payload = result.structured_content.unwrap();
    let description = payload["items"][0]["description"]
        .as_str()
        .unwrap_or_default();
    assert!(description.contains("Active tags (0)"), "{description}");

    let (_, _, result) = backlog
        .call_named(
            "xboct_log_tool_description",
            json!({"query": "tasks_get"}),
            None,
        )
        .await;
    let payload = result.structured_content.unwrap();
    let items = payload["items"].as_array().unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["name"], "tasks_get");

    let (name, args, result) = backlog
        .call_named(
            "xboct_log_call",
            json!({"tool": "request_log_list", "args": {}}),
            None,
        )
        .await;
    assert_eq!(name, "request_log_list");
    assert_eq!(args, json!({}));
    assert_eq!(result.is_error, None);

    let (_, _, result) = backlog
        .call_named("xboct_log_call", json!({"tool": "tasks_delete"}), None)
        .await;
    assert_eq!(result.is_error, Some(true));
}

#[test]
fn lists_the_operation_names_in_the_activity_filter() {
    let (input, _) = tool_schema("activity_list").expect("activity_list schema");
    let op = deref(&input["properties"]["op"], &input);
    let names: Vec<String> = OpName::ALL
        .iter()
        .map(|name| name.as_str().to_string())
        .collect();
    assert_eq!(op["enum"], json!(names));
}

#[test]
fn reads_the_error_kind_and_message_from_a_failed_call() {
    let result = failure(&AppError::validation("bad input"));
    assert_eq!(
        failure_details(&result),
        Some(("validation".to_string(), "bad input".to_string()))
    );
    assert_eq!(failure_details(&success(json!({"ok": true}))), None);
}

#[test]
fn every_tool_result_carries_result_type() {
    for result in [
        success(json!({"ok": true})),
        failure(&AppError::validation("bad input")),
        bare_failure("bad input"),
    ] {
        assert_eq!(result.result_type, Some(ResultType::COMPLETE));
    }
    assert_eq!(success(json!({})).is_error, None);
    assert_eq!(
        failure(&AppError::validation("bad input")).is_error,
        Some(true)
    );
}

#[test]
fn create_many_item_schema_documents_required_fields_and_example() {
    let (input, _) = tool_schema("tasks_create_many").expect("tasks_create_many schema");
    let items = &input["properties"]["items"];
    let description = items["description"].as_str().unwrap_or_default();
    assert!(
        description.contains("\"items\":[{\"project_id\":\"brul\""),
        "items description: {description}"
    );
    let item = deref(&items["items"], &input);
    let required = item["required"].as_array().expect("item required fields");
    assert!(
        required
            .iter()
            .any(|field| field.as_str() == Some("project_id"))
    );
    assert!(required.iter().any(|field| field.as_str() == Some("title")));
}

#[test]
fn validation_error_reports_relationship_fields_inside_batch_items() {
    let message = validation_error(
        "tasks_update_many",
        &json!({"items": [{"task_id": "LOG-1", "blocked_by": ["LOG-2"]}]}),
    )
    .expect("invalid item");
    assert!(message.contains("blocked_by"), "{message}");
    assert!(message.contains("items[0]"), "{message}");
    assert!(message.contains("tasks_add_blocker"), "{message}");
}

#[tokio::test]
async fn call_named_rejects_relationship_fields_in_batch_items() {
    let backlog = backlog().await;
    let (_, _, result) = backlog
        .call_named(
            "tasks_update_many",
            json!({"items": [{"task_id": "LOG-1", "blocked_by": ["LOG-2"]}]}),
            None,
        )
        .await;
    assert_eq!(result.is_error, Some(true));
}

#[tokio::test]
async fn call_named_reports_open_blockers_when_setting_a_status() {
    let backlog = backlog().await;
    for (op, args) in [
        (
            "projects_create",
            json!({"project_id": "log", "name": "Log", "prefix": "LOG"}),
        ),
        (
            "tasks_create",
            json!({"project_id": "log", "title": "Blocker"}),
        ),
        (
            "tasks_create",
            json!({"project_id": "log", "title": "Blocked"}),
        ),
        (
            "tasks_add_blocker",
            json!({"task_id": "LOG-2", "blocked_by": "LOG-1"}),
        ),
    ] {
        let (_, _, result) = backlog.call_named(op, args, None).await;
        assert_eq!(result.is_error, None, "{op} failed");
    }

    let (_, _, result) = backlog
        .call_named(
            "tasks_update",
            json!({"task_id": "LOG-2", "status": "in-progress"}),
            None,
        )
        .await;
    let (kind, message) = failure_details(&result).expect("validation error");
    assert_eq!(kind, "validation");
    assert!(
        message.contains("task LOG-2 has open blocked_by [LOG-1]"),
        "{message}"
    );
    assert!(message.contains("tasks_close"), "{message}");
    assert!(!message.contains("tasks_remove_blocker"), "{message}");
    assert!(message.contains("in-progress"), "{message}");
}

fn assert_refs_resolve(schema: &Map<String, Value>, name: &str) {
    let mut refs = Vec::new();
    collect_refs(&Value::Object(schema.clone()), &mut refs);
    let defs = schema.get("$defs").and_then(Value::as_object);
    for reference in refs {
        let Some(target) = reference.strip_prefix("#/$defs/") else {
            continue;
        };
        assert!(
            defs.is_some_and(|defs| defs.contains_key(target)),
            "{name} has unresolved $ref {reference}"
        );
    }
}

fn collect_refs(value: &Value, refs: &mut Vec<String>) {
    match value {
        Value::Object(object) => {
            if let Some(reference) = object.get("$ref").and_then(Value::as_str) {
                refs.push(reference.to_string());
            }
            for nested in object.values() {
                collect_refs(nested, refs);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_refs(item, refs);
            }
        }
        _ => {}
    }
}

#[tokio::test]
async fn every_tool_schema_resolves_its_definitions() {
    let backlog = backlog().await;
    for tool in tools(&backlog.db).await.expect("tool definitions") {
        assert_refs_resolve(&tool.input_schema, &tool.name);
        if let Some(output) = &tool.output_schema {
            assert_refs_resolve(output, &tool.name);
        }
    }
}
