use serde_json::{Map, Value};
use xboct_log_core::AppError;

const LINK_HINTS: &[(&str, &str)] = &[
    (
        "blocked_by",
        "use tasks_add_blocker to add a blocker to the task",
    ),
    (
        "blocks",
        "use tasks_add_blocker with the roles swapped to add a blocked task",
    ),
    ("relates_to", "use tasks_add_link to relate two tasks"),
    ("duplicates", "use tasks_add_link to mark a duplicate"),
];

pub fn validate_arguments(name: &str, input: &Value) -> Result<(), AppError> {
    let Some((_, schema, _)) = crate::operation_schema(name) else {
        return Ok(());
    };
    let mut problems = Vec::new();
    check_value(name, input, &schema, &schema, "", &mut problems);
    if problems.is_empty() {
        Ok(())
    } else {
        Err(AppError::validation(problems.join("; ")))
    }
}

pub fn suggestion<'a>(key: &str, allowed: &'a [String]) -> Option<&'a str> {
    let suffix = format!("_{key}");
    let endings: Vec<&String> = allowed
        .iter()
        .filter(|name| name.ends_with(&suffix))
        .collect();
    if endings.len() == 1 {
        return Some(endings[0]);
    }
    let mut nearest: Option<(&String, usize)> = None;
    for name in allowed {
        let distance = edit_distance(key, name);
        if distance <= 2 && nearest.is_none_or(|(_, best)| distance < best) {
            nearest = Some((name, distance));
        }
    }
    nearest.map(|(name, _)| name.as_str())
}

fn edit_distance(left: &str, right: &str) -> usize {
    let target: Vec<char> = right.chars().collect();
    let mut previous: Vec<usize> = (0..=target.len()).collect();
    let mut current = vec![0; target.len() + 1];
    for (row, source) in left.chars().enumerate() {
        current[0] = row + 1;
        for (column, value) in target.iter().enumerate() {
            let cost = usize::from(source != *value);
            current[column + 1] = (previous[column + 1] + 1)
                .min(current[column] + 1)
                .min(previous[column] + cost);
        }
        std::mem::swap(&mut previous, &mut current);
    }
    previous[target.len()]
}

fn check_value(
    op: &str,
    value: &Value,
    schema: &Value,
    root: &Value,
    path: &str,
    problems: &mut Vec<String>,
) {
    let schema = deref(schema, root);
    match value {
        Value::Object(object) => {
            let Some(properties) = schema.get("properties").and_then(Value::as_object) else {
                return;
            };
            let allowed: Vec<String> = properties.keys().cloned().collect();
            for key in object.keys() {
                if properties.contains_key(key) {
                    continue;
                }
                let location = if path.is_empty() {
                    String::new()
                } else {
                    format!(" at {path}")
                };
                let mut message = format!("unknown field `{key}`{location}");
                if let Some((_, hint)) = LINK_HINTS.iter().find(|(field, _)| *field == key) {
                    message.push_str(&format!(": {hint}"));
                }
                if let Some(guess) = suggestion(key, &allowed) {
                    message.push_str(&format!(" Did you mean `{guess}`?"));
                }
                message.push_str(&format!("; allowed fields: {}", allowed.join(", ")));
                problems.push(message);
            }
            for (key, child) in object {
                let child_schema = if key == "patch" && properties.contains_key("patch") {
                    patch_schema(op)
                } else {
                    properties.get(key).cloned().unwrap_or(Value::Null)
                };
                let child_root = if key == "patch" && properties.contains_key("patch") {
                    child_schema.clone()
                } else {
                    root.clone()
                };
                let child_path = if path.is_empty() {
                    key.clone()
                } else {
                    format!("{path}.{key}")
                };
                check_value(op, child, &child_schema, &child_root, &child_path, problems);
            }
        }
        Value::Array(items) => {
            let child = schema.get("items").cloned().unwrap_or(Value::Null);
            for (index, item) in items.iter().enumerate() {
                check_value(
                    op,
                    item,
                    &child,
                    root,
                    &format!("{path}[{index}]"),
                    problems,
                );
            }
        }
        _ => {}
    }
}

fn patch_schema(op: &str) -> Value {
    let fields = if op == "tasks_update_many" {
        crate::patch_fields("tasks_update")
    } else {
        crate::patch_fields(op)
    };
    let properties: Map<String, Value> = fields
        .iter()
        .map(|field| (field.to_string(), Value::Object(Map::new())))
        .collect();
    Value::Object(Map::from_iter([
        ("type".to_string(), Value::String("object".to_string())),
        ("properties".to_string(), Value::Object(properties)),
    ]))
}

fn deref<'a>(mut schema: &'a Value, root: &'a Value) -> &'a Value {
    loop {
        if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
            let Some(name) = reference.rsplit('/').next() else {
                return schema;
            };
            let Some(target) = root
                .get("$defs")
                .or_else(|| root.get("definitions"))
                .and_then(|defs| defs.get(name))
            else {
                return schema;
            };
            schema = target;
            continue;
        }
        let Some(variants) = schema.get("anyOf").and_then(Value::as_array) else {
            return schema;
        };
        let mut concrete = variants
            .iter()
            .filter(|variant| variant.get("type").and_then(Value::as_str) != Some("null"));
        let (Some(only), None) = (concrete.next(), concrete.next()) else {
            return schema;
        };
        schema = only;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use xboct_log_core::TaskPatch;

    #[test]
    fn patch_fields_match_the_task_patch_schema() {
        let schema = crate::schema_of::<TaskPatch>();
        let properties = schema["properties"].as_object().expect("patch properties");
        let mut expected: Vec<&str> = properties.keys().map(String::as_str).collect();
        expected.sort_unstable();
        let mut actual = crate::patch_fields("tasks_update").to_vec();
        actual.sort_unstable();
        assert_eq!(actual, expected);
    }

    #[test]
    fn finds_a_replacement_for_a_relationship_field() {
        let allowed = vec!["title".to_string(), "blocked_reason".to_string()];
        assert_eq!(suggestion("blocked_by", &allowed), None);
        assert_eq!(
            LINK_HINTS
                .iter()
                .find(|(field, _)| *field == "blocked_by")
                .map(|(_, hint)| *hint),
            Some("use tasks_add_blocker to add a blocker to the task")
        );
    }
}
